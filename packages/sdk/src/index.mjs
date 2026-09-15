// @golem/sdk — clients for the Apple REST + streaming API.
//
// The JavaScript entry point. Plain ESM with no build step, so a browser, a Worker, Node
// and the `apple` CLI all load the same bytes; the TypeScript surface is the hand-written
// declaration in ../types/index.d.ts, pinned to this file by tests/types.test.mjs.
export { AppleClient, PLAN_IDS, filenameFromDisposition } from './client.mjs';
export { StudioClient, StudioSessionEnded, isStudioToken, pollWaitMs } from './studio.mjs';
export {
  SessionStream,
  STOP_REASONS,
  applyServerMsg,
  emptyRun,
  parseServerMsg,
  validateClientMsg,
} from './stream.mjs';
export { ApiError, backoffMs, messageFromBody, shouldRetry } from './errors.mjs';
export { createTransport } from './http.mjs';
export { finiteInt, finiteNumber, isFiniteNumber, retryAfterSeconds } from './numbers.mjs';
export {
  CLIENT_MSG_TYPES,
  DEFAULT_BASE_URL,
  HEADERS,
  MODES,
  PRESENCE_ACTIVITIES,
  WS_JWT_PREFIX,
  WS_SUBPROTOCOL,
  isProjectId,
  normalizeBaseUrl,
  projectPath,
  socketProtocols,
  socketUrl,
} from './wire.mjs';
export { COMMANDS, UsageError, helpText, parseArgs } from './cli-args.mjs';

export const SDK_VERSION = '0.1.0';
