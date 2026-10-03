/**
 * The safety layer. Every tool goes through here:
 *  - resolveInRepo: a path must resolve (symlinks included) inside REPO_ROOT.
 *  - isSensitivePath: secrets-looking files are refused even inside the repo.
 *  - redact: secret-looking strings are masked in EVERY tool output.
 * There are no write, shell or network tools; this module is the only gate to the filesystem.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyError";
  }
}

const SENSITIVE_BASENAME: RegExp[] = [
  /^\.env(\..*)?$/i, // .env, .env.local, .env.production, .env.example (all refused)
  /\.dev\.vars$/i,
  /^\.dev\.vars/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /secret|credential/i,
];

/** Directory names that are never read (git internals can hold remote tokens). */
const SENSITIVE_SEGMENTS = new Set([".git", ".ssh", ".aws", ".gnupg"]);

export function isSensitiveName(basename: string): boolean {
  return SENSITIVE_BASENAME.some((re) => re.test(basename));
}

/** Lexical check on a repo-relative or absolute path (no filesystem access). */
export function isSensitivePath(p: string): boolean {
  const norm = p.split(path.sep).join("/");
  const segs = norm.split("/").filter(Boolean);
  if (segs.some((s) => SENSITIVE_SEGMENTS.has(s))) return true;
  const base = segs[segs.length - 1] ?? "";
  if (isSensitiveName(base)) return true;
  const ssh = path.join(os.homedir(), ".ssh");
  if (path.isAbsolute(p) && (p === ssh || p.startsWith(ssh + path.sep))) return true;
  return false;
}

function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export type Resolved = { abs: string; rel: string };

/**
 * Resolve a user/model supplied path to a real path inside `root`.
 * Rejects: NUL bytes, traversal, absolute paths outside root, symlinks that point outside,
 * and sensitive files. `mustExist` (default true) makes a missing target an error.
 */
export function resolveInRepo(input: string, root: string, opts: { mustExist?: boolean } = {}): Resolved {
  const mustExist = opts.mustExist ?? true;
  if (typeof input !== "string" || input.length === 0) throw new SafetyError("path is empty");
  if (input.includes("\0")) throw new SafetyError("path contains a NUL byte");
  if (input.length > 1000) throw new SafetyError("path is too long");

  const realRoot = fs.realpathSync(root);
  const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(realRoot, input);

  // lexical containment first (catches ../ before touching the disk)
  if (!within(path.resolve(root), candidate) && !within(realRoot, candidate)) {
    throw new SafetyError(`path escapes the repo root: ${input}`);
  }

  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch (e) {
    if (mustExist) throw new SafetyError(`not found: ${input}`);
    real = candidate;
  }
  if (!within(realRoot, real)) throw new SafetyError(`path resolves outside the repo root (symlink?): ${input}`);

  const relLexical = path.relative(realRoot, candidate) || ".";
  const relReal = path.relative(realRoot, real) || ".";
  if (isSensitivePath(relLexical) || isSensitivePath(relReal)) {
    throw new SafetyError(`refused: ${relLexical} looks like a secret, credential or git-internal file`);
  }
  return { abs: real, rel: relReal.split(path.sep).join("/") };
}

/** Validate a path that is only handed to `git` as a pathspec (it may no longer exist on disk). */
export function validatePathspec(input: string): string {
  if (input.includes("\0")) throw new SafetyError("path contains a NUL byte");
  if (path.isAbsolute(input)) throw new SafetyError("use a repo-relative path");
  const segs = input.split(/[\\/]+/);
  if (segs.includes("..")) throw new SafetyError("path traversal is not allowed");
  if (input.startsWith("-")) throw new SafetyError("path may not start with '-'");
  if (isSensitivePath(input)) throw new SafetyError("refused: sensitive path");
  return input;
}

// ---------------------------------------------------------------- redaction

const REDACTED = "[REDACTED]";

const PATTERNS: Array<[RegExp, string | ((m: string, ...g: string[]) => string)]> = [
  // PEM private keys
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],
  // OpenRouter / OpenAI / Anthropic style keys
  [/\bsk-or-[A-Za-z0-9_-]{8,}/g, "sk-or-" + REDACTED],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-" + REDACTED],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "sk-" + REDACTED],
  // GitHub tokens
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "ghp_" + REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "github_pat_" + REDACTED],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "eyJ" + REDACTED],
  // AWS access key ids
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "AKIA" + REDACTED],
  // Slack / Stripe / Google
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "xox-" + REDACTED],
  [/\b[rsp]k_(?:live|test)_[A-Za-z0-9]{16,}/g, "stripe_" + REDACTED],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, "AIza" + REDACTED],
  // Authorization: Bearer <token>
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi, (_m, p) => p + REDACTED],
  // KEY=value lines (env-file style, UPPER_CASE names that look secret)
  [
    /^([ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)[A-Z0-9_]*[ \t]*=[ \t]*)(["']?)(?![$<{])([A-Za-z0-9_\-./+=:]{8,})\2/gm,
    (_m, pre, q) => `${pre}${q}${REDACTED}${q}`,
  ],
];

/** Mask secret-looking strings. Applied to every string a tool returns. */
export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) {
    out = out.replace(re, rep as never);
  }
  return out;
}

/** Deep-redact all strings in a JSON-like value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as T;
  if (value && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) o[k] = redactDeep(v);
    return o as T;
  }
  return value;
}

/** Cap text by bytes without splitting a code point; reports truncation. */
export function capBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return { text, truncated: false };
  let cut = maxBytes;
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return { text: buf.subarray(0, cut).toString("utf8"), truncated: true };
}
