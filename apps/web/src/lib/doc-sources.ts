/**
 * The documentation pages a reply was actually given, read out of its own `search_docs` results.
 *
 * WHERE THIS COMES FROM, AND WHY IT IS NOT INVENTED. The worker's `search_docs` tool
 * (apps/worker/src/tools.ts) returns an array of `{ citation, title, url, excerpt }` hits from the
 * documentation index, and `detailForUi` forwards that array to the browser as `tool_end.detail`.
 * So the pages are real, they are this run's, and they arrive without anyone having to ask for
 * them. A search that found nothing returns an object (`{ results: [], ... }`), not an array, and
 * yields no sources — never a placeholder.
 *
 * WHAT IS TAKEN, AND WHAT IS NOT. `detail` is untrusted: it is never rendered directly
 * (lib/use-project-socket.ts). This reads exactly two fields from it and checks each one:
 *
 *   * `url` — must parse, must be https, must carry no credentials. The page links to it, so it
 *     is the one field that could do harm.
 *   * `title` — a non-empty string of bounded length, shown as text (React escapes it).
 *
 * The excerpt is not read. It is the model's context, not something the reader asked to see, and
 * a source list is a list of places to go, not a second answer.
 *
 * WHAT IT DOES NOT CLAIM. These are the pages the search handed the model. Whether the reply leaned
 * on each one is not something the browser can see, so the label says where they came from
 * ("from the Roblox documentation") and does not say "used".
 */

/** The worker's tool name. tests/doc-sources.test.mjs holds it against the worker registry. */
export const DOC_SEARCH_TOOL = 'search_docs';

/** The worker returns 5 hits per call and is told to call at most twice; anything past this is not a run. */
const MAX_SOURCES = 10;
const MAX_TITLE = 200;

export interface DocSource {
  url: string;
  title: string;
  host: string;
}

interface ToolLike {
  tool: string;
  ok?: boolean;
  detail?: unknown;
}

function sourceFrom(raw: unknown): DocSource | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { url, title } = raw as { url?: unknown; title?: unknown };
  if (typeof url !== 'string' || typeof title !== 'string') return null;
  const name = title.trim();
  if (name === '' || name.length > MAX_TITLE) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return { url: parsed.href, title: name, host: parsed.hostname };
}

/** Every documentation page this turn's successful searches returned, first seen first, once each. */
export function docSourcesFromTools(tools: readonly ToolLike[]): DocSource[] {
  const out: DocSource[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (tool.tool !== DOC_SEARCH_TOOL || tool.ok !== true || !Array.isArray(tool.detail)) continue;
    for (const hit of tool.detail) {
      const source = sourceFrom(hit);
      if (!source || seen.has(source.url)) continue;
      seen.add(source.url);
      out.push(source);
      if (out.length >= MAX_SOURCES) return out;
    }
  }
  return out;
}
