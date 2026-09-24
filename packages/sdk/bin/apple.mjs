#!/usr/bin/env node
// `apple` — the command line client for the Apple API.
//
// Thin by design: parsing lives in ../src/cli-args.mjs and every call goes through the same
// AppleClient a library consumer uses, so the CLI cannot develop its own idea of the wire
// format. What is left here is process concerns — argv, env, stdout, and exit codes.
//
// EXIT CODES ARE PART OF THE CONTRACT, because a CLI is something scripts call:
//   0  the command succeeded
//   1  the API answered with an error, or could not be reached
//   2  the command line was wrong (unknown command, missing argument, unconfirmed destructive)
import { writeFile } from 'node:fs/promises';
import { AppleClient } from '../src/client.mjs';
import { SessionStream } from '../src/stream.mjs';
import { ApiError } from '../src/errors.mjs';
import { UsageError, helpText, parseArgs } from '../src/cli-args.mjs';
import { DEFAULT_BASE_URL, MODES } from '../src/wire.mjs';
import { SDK_VERSION } from '../src/index.mjs';

const EXIT_OK = 0;
const EXIT_API = 1;
const EXIT_USAGE = 2;

function print(value, { json }) {
  if (typeof value === 'string') {
    process.stdout.write(value.endsWith('\n') ? value : `${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, json ? 0 : 2)}\n`);
}

export async function run(argv, env = process.env) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n\n${helpText()}\n`);
      return EXIT_USAGE;
    }
    throw e;
  }

  if (parsed.flags.version) {
    print(`apple ${SDK_VERSION}`, parsed.flags);
    return EXIT_OK;
  }
  if (parsed.command === null || parsed.flags.help) {
    print(helpText(), parsed.flags);
    return parsed.command === null ? EXIT_USAGE : EXIT_OK;
  }

  const baseUrl = parsed.flags['base-url'] ?? env.APPLE_API_URL ?? env.GOLEM_API_URL ?? DEFAULT_BASE_URL;
  const token = parsed.flags.token ?? env.APPLE_TOKEN ?? env.GOLEM_TOKEN ?? null;
  const adminKey = parsed.flags['admin-key'] ?? env.APPLE_ADMIN_KEY ?? null;
  const client = new AppleClient({ baseUrl, token, adminKey });
  const [a, b] = parsed.args;

  try {
    switch (parsed.command) {
      case 'health':
        print(await client.health(), parsed.flags);
        break;
      case 'me':
        print(await client.me(), parsed.flags);
        break;
      case 'usage':
        print(await client.usage(), parsed.flags);
        break;
      case 'providers':
        print(await client.providers(), parsed.flags);
        break;
      case 'docs':
        print(await client.searchDocs(a), parsed.flags);
        break;
      case 'messages':
        print(await client.messages(a, { limit: parsed.flags.limit ?? 100 }), parsed.flags);
        break;
      case 'search':
        print(await client.searchConversation(a, b), parsed.flags);
        break;
      case 'memory':
        print(await client.memory(a), parsed.flags);
        break;
      case 'checkpoints':
        print(await client.checkpoints(a), parsed.flags);
        break;
      case 'checkpoint':
        print(await client.createCheckpoint(a, parsed.flags.label ?? 'checkpoint'), parsed.flags);
        break;
      case 'restore':
        print(await client.restoreCheckpoint(a, b), parsed.flags);
        break;
      case 'pair':
        print(await client.createPairingCode(a), parsed.flags);
        break;
      case 'roadmap':
        print(await client.roadmap(a, { polish: parsed.flags.polish === true }), parsed.flags);
        break;
      case 'attribution':
        print(await client.attribution(a), parsed.flags);
        break;
      case 'purge':
        print(await client.purge(a), parsed.flags);
        break;
      case 'export': {
        const file = await client.exportTranscript(a, parsed.flags.format ?? 'json');
        const out = parsed.flags.out ?? file.filename;
        await writeFile(out, file.body, 'utf8');
        print({ written: out, bytes: Buffer.byteLength(file.body) }, parsed.flags);
        break;
      }
      case 'chat': {
        const mode = parsed.flags.mode ?? 'agent';
        if (!MODES.includes(mode)) {
          process.stderr.write(`--mode must be one of ${MODES.join(', ')}\n`);
          return EXIT_USAGE;
        }
        if (!token) {
          process.stderr.write('chat needs an access token (--token, APPLE_TOKEN)\n');
          return EXIT_USAGE;
        }
        const stream = new SessionStream({ baseUrl, projectId: a, token }).connect();
        const finished = stream.waitForRun();
        await new Promise((resolve, reject) => {
          stream.on('open', resolve);
          stream.on('gave_up', () => reject(new ApiError('could not open the session socket', 0)));
        });
        stream.sendChat(b, mode, parsed.flags.autonomous === true);
        const result = await finished;
        stream.close();
        print(parsed.flags.json ? result : result.text, parsed.flags);
        break;
      }
      default:
        // Unreachable: parseArgs rejects an unknown command. Present so that adding a
        // command to COMMANDS and forgetting it here fails loudly instead of printing null.
        process.stderr.write(`command "${parsed.command}" is declared but not implemented\n`);
        return EXIT_USAGE;
    }
  } catch (e) {
    if (e instanceof ApiError) {
      process.stderr.write(`${e.message}${e.status ? ` (HTTP ${e.status})` : ''}\n`);
      return EXIT_API;
    }
    if (e instanceof TypeError) {
      process.stderr.write(`${e.message}\n`);
      return EXIT_USAGE;
    }
    throw e;
  }
  return EXIT_OK;
}

// Only when executed, never when imported by a test.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`${e?.stack ?? e}\n`);
      process.exit(1);
    },
  );
}
