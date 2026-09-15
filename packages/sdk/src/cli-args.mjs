// Argument parsing for the `apple` CLI, as a pure function.
//
// SEPARATE FROM THE CLI ON PURPOSE. A parser that only exists inside `main()` can only be
// tested by spawning a process, which means the cases worth testing — a missing argument, a
// `--limit` of "abc", a destructive command without its confirmation — either get skipped or
// get tested by running them for real. Here they are inputs to a function.
import { isProjectId } from './wire.mjs';
import { isFiniteNumber } from './numbers.mjs';

/**
 * Every command, its positional arguments, and its flags.
 *
 * `destructive: true` means the command changes something a user cannot get back, and the
 * parser refuses it without `--yes`. That refusal lives in the parser rather than in the
 * command body so that it cannot be forgotten by the next command that needs it.
 */
export const COMMANDS = Object.freeze({
  health: { args: [], describe: 'service liveness and the deployed build sha' },
  me: { args: [], describe: 'the signed-in account, plan and quota' },
  usage: { args: [], describe: 'Credits spent per day' },
  providers: { args: [], describe: 'whether this deployment can serve inference' },
  docs: { args: ['query'], describe: 'search the ingested Roblox documentation' },
  messages: { args: ['projectId'], flags: { limit: 'number' }, describe: 'recent conversation messages' },
  search: { args: ['projectId', 'query'], describe: 'search a project conversation server-side' },
  memory: { args: ['projectId'], describe: 'what Apple believes about a project' },
  checkpoints: { args: ['projectId'], describe: 'list checkpoints' },
  checkpoint: { args: ['projectId'], flags: { label: 'string' }, describe: 'create a checkpoint' },
  restore: { args: ['projectId', 'checkpointId'], destructive: true, describe: 'restore a checkpoint' },
  pair: { args: ['projectId'], describe: 'mint a Studio pairing code' },
  roadmap: { args: ['projectId'], flags: { polish: 'boolean' }, describe: 'the project roadmap' },
  attribution: { args: ['projectId'], describe: 'asset credits and commercial-use report' },
  export: {
    args: ['projectId'],
    flags: { format: 'string', out: 'string' },
    describe: 'download the whole transcript (json|md)',
  },
  chat: {
    args: ['projectId', 'text'],
    flags: { mode: 'string', timeout: 'number' },
    describe: 'send one turn over the session socket and print the reply',
  },
  purge: { args: ['projectId'], destructive: true, describe: 'delete a project session and its history' },
});

/** Flags every command accepts. */
const GLOBAL_FLAGS = {
  'base-url': 'string',
  token: 'string',
  'admin-key': 'string',
  json: 'boolean',
  yes: 'boolean',
  help: 'boolean',
  version: 'boolean',
};

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function flagType(name, command) {
  if (name in GLOBAL_FLAGS) return GLOBAL_FLAGS[name];
  const spec = command ? COMMANDS[command] : null;
  const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return spec?.flags?.[camel] ?? spec?.flags?.[name] ?? null;
}

/**
 * Turn an argv tail into `{ command, args, flags }`, or throw `UsageError`.
 *
 * Unknown flags and unknown commands are ERRORS, not ignored. A CLI that silently drops
 * `--fromat md` runs the command with the wrong format and reports success, which is the
 * failure mode this whole repository exists to refuse: a mistake that renders as a result.
 */
export function parseArgs(argv) {
  const out = { command: null, args: [], flags: {} };
  const rest = [];
  let i = 0;

  // Flags may appear before the command (`apple --json health`), so the command is whatever
  // first non-flag token survives, and flag typing is resolved in a second pass.
  const tokens = [];
  while (i < argv.length) {
    const tok = argv[i];
    if (tok === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    tokens.push(tok);
    i += 1;
  }

  const positional = [];
  const rawFlags = [];
  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    if (typeof tok === 'string' && tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq > 0) rawFlags.push([tok.slice(2, eq), tok.slice(eq + 1)]);
      else rawFlags.push([tok.slice(2), undefined, k]);
    } else if (typeof tok === 'string' && /^-[a-zA-Z]$/.test(tok)) {
      rawFlags.push([{ h: 'help', v: 'version', j: 'json', y: 'yes' }[tok[1]] ?? tok.slice(1), undefined, k]);
    } else {
      positional.push(tok);
    }
  }

  out.command = positional.shift() ?? null;
  if (out.command !== null && !(out.command in COMMANDS)) {
    const known = Object.keys(COMMANDS).join(', ');
    throw new UsageError(`unknown command "${out.command}" — expected one of: ${known}`);
  }

  // Second pass: now the command is known, a flag can be typed and a boolean can decide
  // whether the token after it was its value or the next positional.
  const consumed = new Set();
  for (const [name, inlineValue, index] of rawFlags) {
    const type = flagType(name, out.command);
    if (type === null) throw new UsageError(`unknown flag --${name}`);
    if (type === 'boolean') {
      out.flags[name] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    let value = inlineValue;
    if (value === undefined) {
      const next = tokens[index + 1];
      if (next === undefined || (typeof next === 'string' && next.startsWith('--'))) {
        throw new UsageError(`--${name} needs a value`);
      }
      value = next;
      consumed.add(next);
    }
    if (type === 'number') {
      const n = Number(value);
      // `Number("abc")` is NaN, and NaN survives every range check as false. A limit that
      // silently became NaN would reach the API as `limit=NaN`.
      if (!isFiniteNumber(n)) throw new UsageError(`--${name} must be a number, got ${JSON.stringify(value)}`);
      out.flags[name] = n;
      continue;
    }
    out.flags[name] = value;
  }

  out.args = positional.filter((p) => !consumed.has(p)).concat(rest);

  if (out.command === null) return out;
  const spec = COMMANDS[out.command];
  if (out.flags.help) return out;

  if (out.args.length < spec.args.length) {
    const missing = spec.args.slice(out.args.length).join(', ');
    throw new UsageError(`${out.command} needs ${spec.args.join(' ')} — missing ${missing}`);
  }
  // A project id is checked here rather than at the first request, because
  // `/api/projects/<garbage>/messages` answers 404 and "no such project" is the wrong
  // sentence for "that is not a project id".
  const idIndex = spec.args.indexOf('projectId');
  if (idIndex >= 0 && !isProjectId(out.args[idIndex])) {
    throw new UsageError(`"${out.args[idIndex]}" is not a project id (expected a UUID)`);
  }
  if (spec.destructive && out.flags.yes !== true) {
    throw new UsageError(`${out.command} cannot be undone — re-run it with --yes to confirm`);
  }
  return out;
}

export function helpText() {
  const rows = Object.entries(COMMANDS).map(([name, spec]) => {
    const usage = [name, ...spec.args.map((a) => `<${a}>`)].join(' ');
    return `  ${usage.padEnd(34)}${spec.describe}`;
  });
  return [
    'apple — command line client for the Apple API',
    '',
    'Usage: apple [--base-url URL] [--token TOKEN] [--json] <command> [args]',
    '',
    'Commands:',
    ...rows,
    '',
    'The access token is read from --token, then APPLE_TOKEN, then GOLEM_TOKEN.',
    'The base URL is read from --base-url, then APPLE_API_URL, then the production worker.',
  ].join('\n');
}
