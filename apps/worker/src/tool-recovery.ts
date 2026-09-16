/**
 * WHEN THE MODEL WRITES THE TOOL CALL INSTEAD OF MAKING IT.
 *
 * THE RUN THIS EXISTS FOR, observed in the owner's own account on 2026-09-16. He asked for
 * "a clicker simulator loop: a pad that awards Coins into leaderstats when a player touches it,
 * a shop GUI listing three upgrades that raise the award, and a display of the current total."
 * What came back was this, rendered as the assistant's message, in a chat window:
 *
 *     {
 *     "title": "Clicker Simulator Loop",
 *     "steps": [
 *     { "title": "Create Click Pad geometry", "detail": "Add a wooden pad part in Workspace…",
 *       "tool": "create_instances" },
 *     …
 *     }
 *
 * followed by "That used the last of your Credits for today." The model had emitted
 * `propose_plan`'s ARGUMENTS as prose rather than calling the tool. Nothing detected that, so the
 * loop treated a tool call as a reply: it printed eighty lines of JSON at a paying user, built
 * nothing, and charged him his whole daily allowance for the privilege.
 *
 * Two separate failures, and the second is the one that hurt:
 *   - the call did not happen, so no work was done;
 *   - the payload was rendered as if it were an answer.
 *
 * WHY THIS IS NOT THE FENCE-PARSING FALLBACK gateway.ts REFUSES TO HAVE, and the distinction is
 * the whole design. That refusal is correct and stands: tool RESULTS carry untrusted content —
 * a script someone else wrote, a page fetched from the web, a Creator Store description — and a
 * parser that turns any JSON in the stream into an executed call turns that content into
 * commands. It is the injection hole, and it is one line of code wide.
 *
 * So recovery here is allowed for exactly one class of tool: one that CANNOT CHANGE ANYTHING AND
 * CANNOT SPEND. `propose_plan` announces a checklist; its own definition says "Costs nothing: no
 * model calls, no images, no change to the project". Recovering it can do no more harm than the
 * model typing the same words. `create_instances`, `run_luau`, `edit_script` and everything else
 * are NEVER recovered from text, no matter how well-formed — for those, the payload is suppressed
 * and the caller is told which tool it named, so it can steer rather than print.
 *
 * The allowlist is the security boundary. Adding a name to it is adding a way for text to become
 * an action; `tests/tool-recovery.test.mjs` asserts that every member is inert, so a mutating tool
 * cannot be added without the test that guards the boundary going red.
 */

/** Tools that may be reconstructed from text. Inert only — see the note above. */
export const RECOVERABLE: ReadonlySet<string> = new Set(['propose_plan']);

export interface Recovery {
  /** The call to run in the model's place, or null when there is nothing to recover. */
  call: { name: string; arguments: string } | null;
  /** What should remain as the assistant's visible text. Empty when the payload was consumed. */
  text: string;
  /**
   * The text WAS a tool payload for a tool that may not be recovered.
   *
   * Reported rather than executed, and reported rather than ignored: the caller has to be able to
   * tell "the model said nothing useful" from "the model tried to act and the call did not
   * happen", because those need different answers.
   */
  refused: string | null;
}

const NOTHING = (text: string): Recovery => ({ call: null, text, refused: null });

/** The body of a ```json / ```tool_call fence, or the text unchanged. */
function unfence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json|tool_call|tool)?\s*\n?([\s\S]*?)\n?\s*```$/.exec(t);
  return (m?.[1] ?? t).trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The shape `propose_plan` takes, recognised without its name.
 *
 * Models that fail to emit a call usually emit the ARGUMENTS alone, with no wrapper naming the
 * tool — which is exactly what happened above. Matching on the argument shape is the only way to
 * recognise that, and `steps: [{ title, tool }]` is specific enough that no other tool in the
 * registry has it.
 */
function looksLikeProposePlan(o: Record<string, unknown>): boolean {
  const steps = o.steps;
  if (!Array.isArray(steps) || steps.length === 0) return false;
  return steps.every(
    (s) => isPlainObject(s) && typeof s.title === 'string' && typeof s.tool === 'string',
  );
}

/**
 * Read a tool call out of an assistant message that is entirely one.
 *
 * `offered` is the tool set this run was actually given. A name outside it is refused rather than
 * recovered — the run's toolset is a permission decision made upstream (see router.ts) and text
 * may not widen it.
 *
 * `known` is EVERY registered tool, and it exists because `refused` is a string the caller puts in
 * front of the model. The name comes out of JSON the model wrote, so without this it is attacker
 * -influenced text being interpolated into a user-role transcript turn — the model would be able to
 * write its own instruction into the conversation by naming a "tool" whose name is that
 * instruction. `packages/evals` A5 caught this on the first run after the nudge was added.
 *
 * Constraining it to the registry makes `refused` a value from a FIXED VOCABULARY, which is the
 * property that makes it safe to interpolate. A name outside the registry is not a tool call at
 * all, so the text is returned untouched rather than described as one.
 */
export function recoverToolCall(
  raw: string,
  offered: ReadonlySet<string>,
  known: ReadonlySet<string> = offered,
): Recovery {
  if (!raw || !raw.trim()) return NOTHING(raw);
  const body = unfence(raw);
  // A cheap pre-filter, and ONLY that — it is not the boundary, and saying so cost a falsification
  // round: replacing it with `body.includes('{')` left every test in tool-recovery.test.mjs green,
  // because the parse below already refuses everything it was refusing.
  if (!body.startsWith('{') || !body.endsWith('}')) return NOTHING(raw);

  //[[ THE BOUNDARY IS HERE: the WHOLE message must be one JSON object.
  //
  //   `JSON.parse` on the entire body, never a regex that extracts the first `{…}` out of it. A
  //   reply that merely CONTAINS JSON — a model explaining a config file, quoting a tool result,
  //   describing what a step returned — is a reply. Lifting a call out of the middle of one is
  //   precisely the injection hole gateway.ts refuses to open, because tool results carry content
  //   this product did not write.
  //
  //   Falsified by swapping this for a first-object extraction: the ordinary-replies test goes red
  //   on the line that quotes a tool result back. ]]
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NOTHING(raw);
  }
  if (!isPlainObject(parsed)) return NOTHING(raw);

  // A wrapper that names the tool, in the three spellings models actually produce.
  let name: string | null = null;
  let args: unknown = parsed;
  for (const [nameKey, argsKeys] of [
    ['name', ['arguments', 'args', 'parameters']],
    ['tool', ['arguments', 'args', 'parameters']],
    ['tool_name', ['arguments', 'args', 'parameters']],
  ] as const) {
    if (typeof parsed[nameKey] !== 'string') continue;
    const key = argsKeys.find((k) => k in parsed);
    if (!key) continue;
    name = parsed[nameKey] as string;
    const inner = parsed[key];
    // Some models double-encode the arguments as a JSON string.
    if (typeof inner === 'string') {
      try {
        args = JSON.parse(inner);
      } catch {
        return NOTHING(raw);
      }
    } else {
      args = inner;
    }
    break;
  }

  if (name === null && looksLikeProposePlan(parsed)) name = 'propose_plan';
  if (name === null) return NOTHING(raw);
  if (!isPlainObject(args)) return NOTHING(raw);
  // A name nothing registers is not a tool call, whatever it looks like — and `refused` must never
  // carry a string the model chose. See the note above.
  if (!known.has(name)) return NOTHING(raw);

  // Outside the run's own toolset, or outside the inert allowlist: suppressed, and named.
  if (!offered.has(name) || !RECOVERABLE.has(name)) {
    return { call: null, text: '', refused: name };
  }
  return { call: { name, arguments: JSON.stringify(args) }, text: '', refused: null };
}
