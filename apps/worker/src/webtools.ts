// THE WEB-FACING TOOL VOCABULARY: browser, search, fetch, screenshot, OCR, GitHub, git, files.
//
// Ten tools over four substrates (the open web, a search endpoint, the GitHub API, a per-project
// file store), all of them sharing one shape:
//
//     a TYPED CONTRACT  -> tool-contract.ts validates the arguments before anything happens
//     an ALLOWLIST      -> net-policy.ts (hosts), plus the repo and path allowlists below
//     an EXPLICIT FAILURE -> net-policy.ts's FetchOutcome; a failure never wears a success's shape
//
// WHY THE SHAPE IS THE WHOLE POINT. These are the first tools in this worker whose argument IS the
// action. Every Studio tool hands its arguments to Luau, which re-validates them and refuses; a
// bad path comes back as a refusal. Here a bad `url` becomes an outbound request from inside
// Cloudflare's network, a bad `repo` becomes a read of someone else's repository, and a bad
// `path` becomes a write into another project's files. Nothing downstream will catch any of it.
//
// AND THE FAILURE RULE, which is this repository's central discipline applied to I/O: a fetch that
// fails must not render as an empty result. Three concrete shapes it takes here, each one tested:
//
//   - `web_search` that cannot reach its provider returns an ERROR, never `{ results: [] }`. The
//     difference is invisible to the model otherwise, and "no results" is a claim about the world.
//   - `browse_page` that was refused by the allowlist returns an ERROR, never `{ text: '' }`.
//   - `screenshot_page` that receives a zero-byte body returns an ERROR, never an empty image.
//     An empty image renders as a blank page, which is a picture of a lie.
//
// A tool that cannot work in this deployment is not offered at all — the same decision
// `toolDefs({ assetLibrary: false })` already makes for `search_asset_library`. `webToolAvailability`
// below answers "can this run here", and it answers from the bindings present at call time.

import type { Env } from './env';
import {
  checkUrl,
  compileHostPolicy,
  failureToToolError,
  fetchBinary,
  guardedFetch,
  type FetchFailure,
  type HostPolicy,
  type WebFetchLike,
} from './net-policy';
import { MAX_ARGS_CHARS, contractParameters, errorsToMessage, validateArgs, type ToolContract } from './tool-contract';

/* ------------------------------------------------------------ the allowlist --- */

/**
 * The hosts this product has a reason to read, with no configuration at all.
 *
 * Deliberately short. Every entry is a place the agent's actual job takes it: Roblox's own
 * documentation and CDN, and GitHub's API and raw file host (which is where both the GitHub tool
 * and the git tool live). Anything else is a deployment decision, made through
 * `WEB_TOOL_ALLOWLIST`, and it is a decision someone has to write down.
 */
export const DEFAULT_WEB_HOSTS: readonly string[] = [
  '.roblox.com',
  '.rbxcdn.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
];

export const GITHUB_API = 'https://api.github.com';

/**
 * The effective host policy for a deployment.
 *
 * A malformed `WEB_TOOL_ALLOWLIST` does NOT partially apply. `compileHostPolicy` refuses the whole
 * list, and the built-in hosts stand — because the failure mode of "take the entries that parsed"
 * is that `["*", "docs.example.com"]` silently becomes an allowlist of one host, and whoever wrote
 * the `*` believes they opened everything. The rejected entries travel back in `errors` so the
 * caller can say so rather than swallowing it.
 */
export function webPolicy(env: Pick<Env, 'WEB_TOOL_ALLOWLIST'>): { policy: HostPolicy; errors: string[] } {
  const raw = (env.WEB_TOOL_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return { policy: { hosts: [...DEFAULT_WEB_HOSTS] }, errors: [] };
  const compiled = compileHostPolicy(raw);
  if (!compiled.ok) return { policy: { hosts: [...DEFAULT_WEB_HOSTS] }, errors: compiled.errors };
  return { policy: { hosts: [...DEFAULT_WEB_HOSTS, ...compiled.hosts] }, errors: [] };
}

/* ------------------------------------------------- repositories, refs, paths --- */

/**
 * Which repositories the GitHub and git tools may read.
 *
 * `owner/*` is allowed here and a bare `*` is not, and the difference is not cosmetic: an owner is
 * a real boundary that someone chose, while `*` is the absence of a choice. The built-in entry is
 * Roblox's own public org, because that is the vendor whose engine this product builds on and the
 * only repositories the agent has a standing reason to read.
 */
export const DEFAULT_REPO_ALLOWLIST: readonly string[] = ['Roblox/*'];

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export type RepoVerdict = { ok: true; owner: string; name: string; repo: string } | { ok: false; detail: string };

export function checkRepo(raw: string, allowlist: readonly string[]): RepoVerdict {
  const value = raw.trim();
  if (!REPO_RE.test(value)) {
    return { ok: false, detail: `"${raw.slice(0, 60)}" is not an owner/name repository` };
  }
  // `..` never appears in a legal repo name, and a path segment that escapes upwards is the whole
  // reason this function exists rather than a bare regex at the call site.
  if (value.includes('..')) return { ok: false, detail: 'a repository name may not contain ".."' };
  const owner = value.slice(0, value.indexOf('/'));
  const name = value.slice(value.indexOf('/') + 1);
  const allowed = allowlist.some((entry) => {
    const e = entry.trim();
    if (!e || e === '*' || e === '*/*') return false; // an entry that means "everything" is ignored, loudly below
    if (e.endsWith('/*')) return owner.toLowerCase() === e.slice(0, -2).toLowerCase();
    return e.toLowerCase() === value.toLowerCase();
  });
  if (!allowed) {
    return { ok: false, detail: `${value} is not on this deployment's repository allowlist (${allowlist.join(', ') || 'empty'})` };
  }
  return { ok: true, owner, name, repo: value };
}

/**
 * A git ref that is safe to put in a URL path and safe to hand to a command line.
 *
 * git's own rules (git-check-ref-format) plus two of ours. A leading `-` is refused because a ref
 * that starts with a dash is an OPTION to every command that would take it, and `..` is refused
 * because `main..evil` is a different request than the one the caller believes they made.
 */
export function checkGitRef(raw: string): { ok: true; ref: string } | { ok: false; detail: string } {
  const ref = raw.trim();
  if (!ref) return { ok: false, detail: 'an empty ref names nothing' };
  if (ref.length > 200) return { ok: false, detail: 'that ref is implausibly long' };
  if (ref.startsWith('-')) return { ok: false, detail: 'a ref may not start with "-"; that is an option, not a ref' };
  if (ref.includes('..')) return { ok: false, detail: 'a ref may not contain ".."' };
  if (ref.startsWith('/') || ref.endsWith('/') || ref.includes('//')) return { ok: false, detail: 'a ref may not have empty path segments' };
  if (ref.endsWith('.') || ref.endsWith('.lock')) return { ok: false, detail: 'a ref may not end with "." or ".lock"' };
  if (ref.includes('@{')) return { ok: false, detail: 'a ref may not contain "@{"' };
  if (/[\u0000-\u0020\u007f~^:?*[\\]/.test(ref)) return { ok: false, detail: 'a ref may not contain whitespace or any of ~^:?*[\\' };
  return { ok: true, ref };
}

/* --------------------------------------------------------- the file store ----- */

export const WORKSPACE_EXTENSIONS: readonly string[] = ['.md', '.txt', '.json', '.csv', '.luau', '.lua', '.ts', '.js', '.yml', '.yaml'];
// 48 KiB, AND IT USED TO BE 128 KiB — a limit that could never fire.
//
// `content` arrives as a JSON string argument, and runWebTool checks MAX_ARGS_CHARS (64,000) at
// webtools.ts:1001 BEFORE the tool body runs. So anything over 64,000 characters of arguments was
// refused with "131104 characters of arguments is past the 64000-character limit" — true, useless,
// and about the wrong thing. The user asked to write a file; they were told about argument
// encoding. Both workspace size guards below were unreachable: the verification pass removed the
// contract's `max`, removed the runtime `bytes >` branch, and removed both together, and all three
// were ZERO RED.
//
// Set below the argument cap so the file-specific message is the one that fires, with room for
// JSON escaping and the rest of the payload. A stated limit has to be the limit that applies, or
// the number is decoration.
export const WORKSPACE_MAX_BYTES = 48 * 1024;
export const WORKSPACE_MAX_DEPTH = 8;

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type PathVerdict = { ok: true; path: string } | { ok: false; detail: string };

/**
 * A path inside this project's own scratch workspace, and nowhere else.
 *
 * Written as a validator over the STRING rather than as a resolve-and-compare, because there is no
 * real filesystem underneath to resolve against — the store is KV. That removes the usual
 * `resolve(root, p).startsWith(root)` escape hatch and replaces it with the stricter rule: every
 * segment must be an ordinary name. `..` is refused outright rather than normalised away, since a
 * caller who wrote `..` asked for something this tool will not do, and silently rewriting their
 * request into a different one is how a path guard becomes a path bug.
 */
export function checkWorkspacePath(raw: string): PathVerdict {
  const value = raw.trim();
  if (!value) return { ok: false, detail: 'no path was given' };
  if (value.length > 200) return { ok: false, detail: 'that path is too long' };
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return { ok: false, detail: 'the path must be relative to the project workspace' };
  if (value.includes('\\')) return { ok: false, detail: 'use "/" as the separator' };
  if (value.includes('\u0000')) return { ok: false, detail: 'the path contains a NUL byte' };
  const segments = value.split('/');
  if (segments.length > WORKSPACE_MAX_DEPTH) return { ok: false, detail: `at most ${WORKSPACE_MAX_DEPTH} path segments` };
  for (const s of segments) {
    if (s === '' ) return { ok: false, detail: 'the path has an empty segment' };
    if (s === '.' || s === '..') return { ok: false, detail: '"." and ".." are not allowed in a workspace path' };
    if (!SEGMENT_RE.test(s)) return { ok: false, detail: `"${s.slice(0, 40)}" is not a usable file or folder name` };
  }
  const last = segments[segments.length - 1] ?? '';
  const dot = last.lastIndexOf('.');
  const ext = dot > 0 ? last.slice(dot).toLowerCase() : '';
  if (!WORKSPACE_EXTENSIONS.includes(ext)) {
    return { ok: false, detail: `${ext || 'a file with no extension'} is not a workspace file type (${WORKSPACE_EXTENSIONS.join(' ')})` };
  }
  return { ok: true, path: value };
}

export interface WorkspaceFile {
  path: string;
  bytes: number;
  updatedAt: number;
}

/** The store behind the file tools. Small on purpose: three verbs, nothing clever. */
export interface WorkspaceStore {
  list(prefix: string): Promise<WorkspaceFile[]>;
  read(path: string): Promise<{ content: string; bytes: number; updatedAt: number } | null>;
  write(path: string, content: string): Promise<{ bytes: number; created: boolean }>;
}

/**
 * The production store: this worker's KV, keyed by project.
 *
 * The project is IN THE KEY, which is the authorisation — the same decision `imageKvKey` documents
 * for generated images. A tool call cannot construct a key into another project's workspace,
 * because it never supplies the project half.
 */
export function kvWorkspace(kv: KVNamespace, projectId: string): WorkspaceStore {
  const prefix = `ws:${projectId}:`;
  return {
    async list(sub) {
      const listed = await kv.list({ prefix: prefix + sub });
      return listed.keys.map((k) => {
        const meta = (k.metadata ?? {}) as { bytes?: number; updatedAt?: number };
        return {
          path: k.name.slice(prefix.length),
          // Metadata written by an older version, or by nothing at all, must not become a
          // confident `0`. -1 says "not recorded", which is a different claim than "empty".
          bytes: Number.isFinite(meta.bytes) ? (meta.bytes as number) : -1,
          updatedAt: Number.isFinite(meta.updatedAt) ? (meta.updatedAt as number) : -1,
        };
      });
    },
    async read(path) {
      const value = await kv.get(prefix + path);
      if (value === null || value === undefined) return null;
      return { content: value, bytes: new TextEncoder().encode(value).length, updatedAt: Date.now() };
    },
    async write(path, content) {
      const existing = await kv.get(prefix + path);
      const bytes = new TextEncoder().encode(content).length;
      await kv.put(prefix + path, content, { metadata: { bytes, updatedAt: Date.now() } });
      return { bytes, created: existing === null || existing === undefined };
    },
  };
}

/** An in-process store with the same contract, for tests and for the eval harness. */
export function memoryWorkspace(seed: Record<string, string> = {}): WorkspaceStore {
  const files = new Map<string, { content: string; updatedAt: number }>();
  for (const [k, v] of Object.entries(seed)) files.set(k, { content: v, updatedAt: Date.now() });
  return {
    async list(prefix) {
      return [...files.entries()]
        .filter(([p]) => p.startsWith(prefix))
        .map(([path, f]) => ({ path, bytes: new TextEncoder().encode(f.content).length, updatedAt: f.updatedAt }));
    },
    async read(path) {
      const f = files.get(path);
      return f ? { content: f.content, bytes: new TextEncoder().encode(f.content).length, updatedAt: f.updatedAt } : null;
    },
    async write(path, content) {
      const created = !files.has(path);
      files.set(path, { content, updatedAt: Date.now() });
      return { bytes: new TextEncoder().encode(content).length, created };
    },
  };
}

/* ------------------------------------------------------------- HTML reading --- */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
};

/** Named and numeric entities. Unknown names are left alone rather than blanked. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    // Explicit membership. `ENTITIES[body]` alone would resolve `constructor` to a function and
    // splice `function Object() { [native code] }` into the page text.
    return Object.prototype.hasOwnProperty.call(ENTITIES, body.toLowerCase()) ? (ENTITIES[body.toLowerCase()] ?? whole) : whole;
  });
}

export function pageTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1] ?? '').replace(/\s+/g, ' ').trim() || null : null;
}

/**
 * The readable text of a page.
 *
 * Script, style, noscript, template and svg bodies are removed with their CONTENT, because a page
 * whose JS is inlined would otherwise "read" as a few kilobytes of minified source and the model
 * would try to answer questions from it. Block-level tags become newlines so paragraphs stay
 * paragraphs; everything else becomes a space.
 */
export function pageText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const spaced = withoutHidden
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(spaced)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface PageLink {
  href: string;
  text: string;
}

/** Links, resolved against the page and filtered to the allowlist. Refusals are counted, not hidden. */
export function pageLinks(html: string, baseUrl: string, policy: HostPolicy, limit = 50): { links: PageLink[]; offAllowlist: number } {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  let offAllowlist = 0;
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let resolved: string;
    try {
      resolved = new URL(decodeEntities(m[1] ?? ''), baseUrl).toString();
    } catch {
      continue;
    }
    if (!checkUrl(resolved, policy).ok) {
      offAllowlist += 1;
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (links.length < limit) links.push({ href: resolved, text: pageText(m[2] ?? '').slice(0, 120) });
  }
  return { links, offAllowlist };
}

/* -------------------------------------------------------------- the context --- */

/**
 * What a web tool needs from its caller.
 *
 * Every capability beyond `env` is INJECTED and optional, and each absence has a defined answer
 * rather than a silent degradation:
 *
 *   `fetchImpl`  absent -> the global fetch. Present in tests so the suite never touches the network.
 *   `workspace`  absent -> built from `env.KV` and the project id; without a project, the file
 *                tools refuse, because a workspace with no owner is not a workspace.
 *   `readTextFromImage` absent -> `ocr_image` reports `not_configured`. It never returns "".
 *   `showImage`  absent -> `screenshot_page` still reports what it captured, and says the image
 *                could not be shown. It never claims to have displayed something it did not.
 */
export interface WebToolCtx {
  env: Env;
  projectId?: string;
  fetchImpl?: WebFetchLike;
  workspace?: WorkspaceStore;
  readTextFromImage?(dataUrl: string, opts: { language: string }): Promise<{ text: string } | { error: string }>;
  showImage?(pngBase64: string, subject: string, meta: { width: number; height: number; note?: string }): Promise<boolean>;
}

export interface WebTool {
  contract: ToolContract;
  /** Whether this tool can do anything in this deployment, and why not when it cannot. */
  available(env: Env): { ok: true } | { ok: false; why: string };
  run(ctx: WebToolCtx, args: Record<string, unknown>): Promise<unknown>;
}

function policyFor(ctx: WebToolCtx): HostPolicy {
  return webPolicy(ctx.env).policy;
}

function notConfigured(detail: string): { error: string; failure: FetchFailure } {
  return failureToToolError({ kind: 'not_configured', detail });
}

/* ------------------------------------------------------------------ the tools --- */

const TEXTUAL = ['text/html', 'text/plain', 'text/markdown', 'application/json', 'application/xml', 'text/xml', 'application/xhtml+xml'];

const webFetchTool: WebTool = {
  contract: {
    name: 'web_fetch',
    description:
      'Fetch one https URL and return its body as text. Only hosts on this deployment\'s allowlist can be reached, redirects are followed only while they stay on the allowlist, and a failure is reported as an error — never as an empty page.',
    args: {
      url: { type: 'string', description: 'The https URL to fetch.', required: true, max: 2048 },
      maxChars: { type: 'integer', description: 'How much of the body to return (default 2000).', min: 200, max: 8000, default: 2000 },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const outcome = await guardedFetch(args.url, {
      policy: policyFor(ctx),
      fetchImpl: ctx.fetchImpl,
      accept: TEXTUAL,
      headers: { accept: TEXTUAL.join(', ') },
    });
    if (!outcome.ok) return failureToToolError(outcome.failure);
    const maxChars = args.maxChars as number;
    const content = outcome.body.slice(0, maxChars);
    return {
      url: outcome.url,
      status: outcome.status,
      contentType: outcome.contentType,
      bytes: outcome.bytes,
      redirects: outcome.hops.length - 1,
      contentTruncated: outcome.truncated || outcome.body.length > maxChars,
      content,
    };
  },
};

const browsePageTool: WebTool = {
  contract: {
    name: 'browse_page',
    description:
      'Read a web page like a browser would: its title, its readable text with the markup and scripts removed, or its links. Same allowlist as web_fetch.',
    args: {
      url: { type: 'string', description: 'The https URL of the page.', required: true, max: 2048 },
      extract: { type: 'string', description: 'What to return.', enum: ['text', 'title', 'links'], default: 'text' },
      maxChars: { type: 'integer', description: 'Cap on returned text (default 2000).', min: 200, max: 8000, default: 2000 },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const policy = policyFor(ctx);
    const outcome = await guardedFetch(args.url, {
      policy,
      fetchImpl: ctx.fetchImpl,
      accept: ['text/html', 'application/xhtml+xml', 'text/plain'],
      headers: { accept: 'text/html' },
    });
    if (!outcome.ok) return failureToToolError(outcome.failure);

    const title = pageTitle(outcome.body);
    const extract = args.extract as string;
    if (extract === 'title') {
      // A page with no <title> is a fact about the page, and it is reported as one — `null` plus a
      // note, rather than an empty string that reads like a title nobody bothered to set.
      return { url: outcome.url, title, found: title !== null, note: title ? undefined : 'this page has no <title>' };
    }
    if (extract === 'links') {
      const { links, offAllowlist } = pageLinks(outcome.body, outcome.url, policy);
      return { url: outcome.url, title, links, returned: links.length, offAllowlist };
    }
    const text = pageText(outcome.body);
    const maxChars = args.maxChars as number;
    return {
      url: outcome.url,
      title,
      extractedChars: text.length,
      textTruncated: text.length > maxChars,
      text: text.slice(0, maxChars),
      note: text.length === 0 ? 'the page was fetched successfully and contained no readable text' : undefined,
    };
  },
};

const webSearchTool: WebTool = {
  contract: {
    name: 'web_search',
    description:
      'Search the web through this deployment\'s configured search endpoint. Results whose URL is not on the allowlist are dropped and counted. A search that could not run is an error, never an empty result list.',
    args: {
      query: { type: 'string', description: 'What to search for.', required: true, min: 2, max: 200 },
      limit: { type: 'integer', description: 'How many results to return (default 5).', min: 1, max: 20, default: 5 },
    },
  },
  available(env) {
    if (!env.SEARCH_API_URL) return { ok: false, why: 'SEARCH_API_URL is not set in this deployment' };
    return { ok: true };
  },
  async run(ctx, args) {
    const endpoint = ctx.env.SEARCH_API_URL;
    if (!endpoint) return notConfigured('SEARCH_API_URL is not set, so there is no search provider to ask');
    const policy = policyFor(ctx);
    // The provider's own host has to be on the allowlist too. A search endpoint nobody allowlisted
    // is a misconfiguration, and reporting it is more useful than quietly exempting it.
    const endpointVerdict = checkUrl(endpoint, policy);
    if (!endpointVerdict.ok) {
      return notConfigured(`SEARCH_API_URL points at ${endpointVerdict.detail}; add its host to WEB_TOOL_ALLOWLIST`);
    }
    const url = new URL(endpointVerdict.url);
    url.searchParams.set('q', args.query as string);
    url.searchParams.set('count', String(args.limit));
    const headers: Record<string, string> = { accept: 'application/json' };
    if (ctx.env.SEARCH_API_KEY) headers.authorization = `Bearer ${ctx.env.SEARCH_API_KEY}`;

    const outcome = await guardedFetch(url.toString(), { policy, fetchImpl: ctx.fetchImpl, accept: ['application/json'], headers });
    if (!outcome.ok) return failureToToolError(outcome.failure);
    let parsed: unknown;
    try {
      parsed = JSON.parse(outcome.body);
    } catch {
      // Unreadable JSON is a failure of the search, not a search that found nothing.
      return failureToToolError({ kind: 'network', detail: 'the search endpoint answered with something that is not JSON' });
    }
    const rows = Array.isArray((parsed as { results?: unknown })?.results)
      ? ((parsed as { results: unknown[] }).results)
      : Array.isArray(parsed)
        ? (parsed as unknown[])
        : null;
    if (!rows) {
      return failureToToolError({ kind: 'network', detail: 'the search endpoint answered JSON with no `results` array' });
    }
    let offAllowlist = 0;
    const results: { title: string; url: string; snippet: string }[] = [];
    for (const row of rows) {
      const r = (row ?? {}) as Record<string, unknown>;
      const href = typeof r.url === 'string' ? r.url : typeof r.link === 'string' ? r.link : '';
      const verdict = checkUrl(href, policy);
      if (!verdict.ok) {
        offAllowlist += 1;
        continue;
      }
      if (results.length >= (args.limit as number)) break;
      results.push({
        title: (typeof r.title === 'string' ? r.title : '').slice(0, 200) || verdict.host,
        url: verdict.url,
        snippet: (typeof r.snippet === 'string' ? r.snippet : typeof r.description === 'string' ? r.description : '').slice(0, 300),
      });
    }
    return {
      query: args.query,
      searched: true,
      results,
      returned: results.length,
      offAllowlist,
      note: results.length === 0 ? `the search ran and returned nothing usable${offAllowlist ? ` (${offAllowlist} results were off the allowlist)` : ''}` : undefined,
    };
  },
};

const screenshotTool: WebTool = {
  contract: {
    name: 'screenshot_page',
    description:
      'Capture a PNG of a web page through this deployment\'s configured rendering service, and show it to the user. A capture that fails, or that comes back with no bytes, is an error — never a blank image.',
    args: {
      url: { type: 'string', description: 'The https URL to capture.', required: true, max: 2048 },
      width: { type: 'integer', description: 'Viewport width in pixels (default 1280).', min: 320, max: 2000, default: 1280 },
      height: { type: 'integer', description: 'Viewport height in pixels (default 800).', min: 240, max: 2000, default: 800 },
      fullPage: { type: 'boolean', description: 'Capture the whole scrollable page rather than the viewport.', default: false },
    },
  },
  available(env) {
    if (!env.SCREENSHOT_API_URL) return { ok: false, why: 'SCREENSHOT_API_URL is not set in this deployment' };
    return { ok: true };
  },
  async run(ctx, args) {
    const endpoint = ctx.env.SCREENSHOT_API_URL;
    if (!endpoint) return notConfigured('SCREENSHOT_API_URL is not set, so there is no renderer to ask');
    const policy = policyFor(ctx);
    const endpointVerdict = checkUrl(endpoint, policy);
    if (!endpointVerdict.ok) {
      return notConfigured(`SCREENSHOT_API_URL points at ${endpointVerdict.detail}; add its host to WEB_TOOL_ALLOWLIST`);
    }
    // The page being captured is checked BEFORE the renderer is asked. A renderer is a fetch
    // engine we do not control, so handing it an off-allowlist URL would launder the allowlist.
    const target = checkUrl(args.url, policy);
    if (!target.ok) return failureToToolError({ kind: 'blocked', reason: target.reason, detail: target.detail });

    const headers: Record<string, string> = { accept: 'image/png', 'content-type': 'application/json' };
    if (ctx.env.SCREENSHOT_API_KEY) headers.authorization = `Bearer ${ctx.env.SCREENSHOT_API_KEY}`;
    const binary = await fetchBinary(endpointVerdict.url, {
      policy,
      fetchImpl: ctx.fetchImpl,
      method: 'POST',
      headers,
      body: JSON.stringify({ url: target.url, width: args.width, height: args.height, fullPage: args.fullPage }),
      accept: ['image/png'],
      maxBytes: 4 * 1024 * 1024,
      timeoutMs: 20_000,
    });
    if (!binary.ok) return failureToToolError(binary.failure);

    const meta = { width: args.width as number, height: args.height as number, note: `screenshot of ${target.url}` };
    const shown = ctx.showImage ? await ctx.showImage(binary.base64, `Screenshot of ${target.host}`, meta) : false;
    return {
      url: target.url,
      width: meta.width,
      height: meta.height,
      fullPage: args.fullPage,
      bytes: binary.bytes,
      format: 'png',
      shown,
      note: shown ? 'the screenshot is displayed above' : 'the screenshot was captured but this session has no surface to display it on',
    };
  },
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const ocrTool: WebTool = {
  contract: {
    name: 'ocr_image',
    description:
      'Read the text in an image at an allowlisted https URL. Returns the text it found; an image with no text says so, and a read that could not happen is an error.',
    args: {
      imageUrl: { type: 'string', description: 'The https URL of the image.', required: true, max: 2048 },
      language: { type: 'string', description: 'Expected language of the text.', enum: ['en', 'he', 'auto'], default: 'auto' },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    if (!ctx.readTextFromImage) {
      return notConfigured('no text-reading engine is wired into this session');
    }
    const binary = await fetchBinary(args.imageUrl, {
      policy: policyFor(ctx),
      fetchImpl: ctx.fetchImpl,
      accept: IMAGE_TYPES,
      maxBytes: 6 * 1024 * 1024,
    });
    if (!binary.ok) return failureToToolError(binary.failure);

    const dataUrl = `data:${binary.contentType};base64,${binary.base64}`;
    const read = await ctx.readTextFromImage(dataUrl, { language: args.language as string });
    if ('error' in read) {
      // THE DISTINCTION THIS TOOL EXISTS TO KEEP. An engine that failed is not an image with no
      // text in it, and collapsing the two would let "the OCR call errored" reach the model as
      // "this image is blank".
      return { error: `the image was fetched but could not be read: ${read.error}`, imageBytes: binary.bytes, url: binary.url };
    }
    const text = read.text ?? '';
    return {
      url: binary.url,
      imageBytes: binary.bytes,
      contentType: binary.contentType,
      chars: text.length,
      text: text.slice(0, 4000),
      note: text.trim().length === 0 ? 'the image was read successfully and contains no legible text' : undefined,
    };
  },
};

function githubHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'golem-agent',
    'x-github-api-version': '2022-11-28',
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

function repoAllowlist(env: Env): string[] {
  const extra = (env.GITHUB_REPO_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_REPO_ALLOWLIST, ...extra];
}

async function githubJson(ctx: WebToolCtx, path: string): Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }> {
  const outcome = await guardedFetch(`${GITHUB_API}${path}`, {
    policy: policyFor(ctx),
    fetchImpl: ctx.fetchImpl,
    accept: ['application/json', 'application/vnd.github'],
    headers: githubHeaders(ctx.env),
  });
  if (!outcome.ok) return { ok: false, error: failureToToolError(outcome.failure) };
  try {
    return { ok: true, value: JSON.parse(outcome.body) };
  } catch {
    return { ok: false, error: failureToToolError({ kind: 'network', detail: 'GitHub answered with something that is not JSON' }) };
  }
}

const githubTool: WebTool = {
  contract: {
    name: 'github_lookup',
    description:
      'Read public metadata from an allowlisted GitHub repository: the repository itself, its open issues, one issue or pull request, or its releases.',
    args: {
      repo: { type: 'string', description: 'owner/name, e.g. Roblox/creator-docs.', required: true, max: 140 },
      resource: { type: 'string', description: 'What to read.', enum: ['repo', 'issues', 'issue', 'pull', 'releases'], required: true },
      number: { type: 'integer', description: 'Issue or pull request number, required for "issue" and "pull".', min: 1, max: 1_000_000 },
      limit: { type: 'integer', description: 'How many rows for a list (default 10).', min: 1, max: 50, default: 10 },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const verdict = checkRepo(args.repo as string, repoAllowlist(ctx.env));
    if (!verdict.ok) return { error: verdict.detail };
    const resource = args.resource as string;
    const limit = args.limit as number;
    if ((resource === 'issue' || resource === 'pull') && !Number.isFinite(args.number as number)) {
      return { error: `${resource} needs a "number"` };
    }
    const paths: Record<string, string> = {
      repo: `/repos/${verdict.repo}`,
      issues: `/repos/${verdict.repo}/issues?state=open&per_page=${limit}`,
      issue: `/repos/${verdict.repo}/issues/${args.number}`,
      pull: `/repos/${verdict.repo}/pulls/${args.number}`,
      releases: `/repos/${verdict.repo}/releases?per_page=${limit}`,
    };
    // Explicit membership again: `paths[resource]` is safe only because `resource` was checked
    // against the contract's enum, and this second check is what makes that true at runtime.
    if (!Object.prototype.hasOwnProperty.call(paths, resource)) return { error: `unknown resource ${resource}` };
    const res = await githubJson(ctx, paths[resource] ?? '');
    if (!res.ok) return res.error;
    return { repo: verdict.repo, resource, data: summariseGithub(resource, res.value, limit) };
  },
};

/** Keep the model's context for the fields a person would actually read. */
function summariseGithub(resource: string, value: unknown, limit: number): unknown {
  const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
  if (resource === 'repo') {
    const r = (value ?? {}) as Record<string, unknown>;
    return pick(r, ['full_name', 'description', 'default_branch', 'stargazers_count', 'open_issues_count', 'license', 'pushed_at', 'archived']);
  }
  if (resource === 'issue' || resource === 'pull') {
    const r = (value ?? {}) as Record<string, unknown>;
    const out = pick(r, ['number', 'title', 'state', 'created_at', 'updated_at', 'merged_at', 'comments']);
    if (typeof r.body === 'string') out.body = r.body.slice(0, 1200);
    return out;
  }
  const rows = Array.isArray(value) ? value.slice(0, limit) : [];
  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return pick(r, ['number', 'title', 'state', 'tag_name', 'name', 'published_at', 'created_at', 'html_url']);
  });
}

const gitTool: WebTool = {
  contract: {
    name: 'git_history',
    description:
      'Version-control history for an allowlisted repository: commits on a ref (log), one commit with its changed files (show), the difference between two refs (diff), or the file tree at a ref (ls_files). Read-only — this tool can never write to a repository.',
    args: {
      repo: { type: 'string', description: 'owner/name.', required: true, max: 140 },
      action: { type: 'string', description: 'Which read to perform.', enum: ['log', 'show', 'diff', 'ls_files'], required: true },
      ref: { type: 'string', description: 'Branch, tag or commit sha. Defaults to the default branch.', max: 200 },
      base: { type: 'string', description: 'The ref to diff FROM, for action "diff".', max: 200 },
      path: { type: 'string', description: 'Limit "log" to one path.', max: 200 },
      limit: { type: 'integer', description: 'How many commits or files (default 10).', min: 1, max: 100, default: 10 },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const verdict = checkRepo(args.repo as string, repoAllowlist(ctx.env));
    if (!verdict.ok) return { error: verdict.detail };
    const action = args.action as string;
    const limit = args.limit as number;

    const refs: Record<string, string> = {};
    for (const key of ['ref', 'base'] as const) {
      const raw = args[key];
      if (typeof raw !== 'string') continue;
      const checked = checkGitRef(raw);
      if (!checked.ok) return { error: `${key}: ${checked.detail}` };
      refs[key] = checked.ref;
    }
    if (typeof args.path === 'string') {
      const p = checkWorkspacePathLoose(args.path);
      if (!p.ok) return { error: `path: ${p.detail}` };
    }

    if (action === 'log') {
      const q = new URLSearchParams({ per_page: String(limit) });
      if (refs.ref) q.set('sha', refs.ref);
      if (typeof args.path === 'string') q.set('path', args.path);
      const res = await githubJson(ctx, `/repos/${verdict.repo}/commits?${q.toString()}`);
      if (!res.ok) return res.error;
      const rows = Array.isArray(res.value) ? res.value : [];
      return {
        repo: verdict.repo,
        action,
        ref: refs.ref ?? '(default branch)',
        commits: rows.slice(0, limit).map((row) => {
          const r = (row ?? {}) as Record<string, unknown>;
          const commit = (r.commit ?? {}) as Record<string, unknown>;
          const author = (commit.author ?? {}) as Record<string, unknown>;
          return {
            sha: typeof r.sha === 'string' ? r.sha.slice(0, 12) : '(none)',
            message: typeof commit.message === 'string' ? (commit.message.split('\n')[0] ?? '').slice(0, 200) : '',
            author: typeof author.name === 'string' ? author.name : '',
            date: typeof author.date === 'string' ? author.date : '',
          };
        }),
      };
    }

    if (action === 'show') {
      if (!refs.ref) return { error: 'show needs a "ref" — a commit sha, branch or tag' };
      const res = await githubJson(ctx, `/repos/${verdict.repo}/commits/${encodeURIComponent(refs.ref)}`);
      if (!res.ok) return res.error;
      const r = (res.value ?? {}) as Record<string, unknown>;
      const commit = (r.commit ?? {}) as Record<string, unknown>;
      const files = Array.isArray(r.files) ? r.files : [];
      return {
        repo: verdict.repo,
        action,
        sha: typeof r.sha === 'string' ? r.sha : refs.ref,
        message: typeof commit.message === 'string' ? commit.message.slice(0, 1000) : '',
        files: files.slice(0, limit).map((f) => {
          const file = (f ?? {}) as Record<string, unknown>;
          return { filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions };
        }),
        fileCount: files.length,
      };
    }

    if (action === 'diff') {
      if (!refs.base || !refs.ref) return { error: 'diff needs both "base" and "ref"' };
      const res = await githubJson(ctx, `/repos/${verdict.repo}/compare/${encodeURIComponent(refs.base)}...${encodeURIComponent(refs.ref)}`);
      if (!res.ok) return res.error;
      const r = (res.value ?? {}) as Record<string, unknown>;
      const files = Array.isArray(r.files) ? r.files : [];
      return {
        repo: verdict.repo,
        action,
        base: refs.base,
        head: refs.ref,
        status: r.status,
        aheadBy: r.ahead_by,
        behindBy: r.behind_by,
        files: files.slice(0, limit).map((f) => {
          const file = (f ?? {}) as Record<string, unknown>;
          return { filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions };
        }),
        fileCount: files.length,
      };
    }

    // ls_files
    if (!refs.ref) return { error: 'ls_files needs a "ref"' };
    const res = await githubJson(ctx, `/repos/${verdict.repo}/git/trees/${encodeURIComponent(refs.ref)}?recursive=1`);
    if (!res.ok) return res.error;
    const r = (res.value ?? {}) as Record<string, unknown>;
    const tree = Array.isArray(r.tree) ? r.tree : [];
    const blobs = tree.filter((t) => ((t ?? {}) as Record<string, unknown>).type === 'blob');
    return {
      repo: verdict.repo,
      action,
      ref: refs.ref,
      // `truncated` is GitHub's own word for "this tree is too big and you are not seeing all of
      // it". Passing it through is the difference between a partial listing and a wrong one.
      treeTruncated: r.truncated === true,
      fileCount: blobs.length,
      files: blobs.slice(0, limit).map((t) => ((t ?? {}) as Record<string, unknown>).path),
    };
  },
};

/** A repository path is not a workspace path: no extension allowlist, same traversal rules. */
function checkWorkspacePathLoose(raw: string): PathVerdict {
  const value = raw.trim();
  if (!value) return { ok: false, detail: 'no path was given' };
  if (value.startsWith('/') || value.includes('\\') || value.includes('\u0000')) return { ok: false, detail: 'the path must be a relative POSIX path' };
  for (const s of value.split('/')) {
    if (s === '' || s === '.' || s === '..') return { ok: false, detail: '"." and ".." are not allowed in a path' };
  }
  return { ok: true, path: value };
}

function workspaceFor(ctx: WebToolCtx): WorkspaceStore | { error: string } {
  if (ctx.workspace) return ctx.workspace;
  if (!ctx.projectId) return { error: 'there is no project in this session, so there is no workspace to read or write' };
  if (!ctx.env.KV) return { error: 'this deployment has no KV binding, so the workspace has nowhere to live' };
  return kvWorkspace(ctx.env.KV, ctx.projectId);
}

const workspaceListTool: WebTool = {
  contract: {
    name: 'workspace_list',
    description: 'List the files in this project\'s scratch workspace. The workspace is Golem\'s own storage for notes, plans and generated data — it is not the Roblox place.',
    args: { prefix: { type: 'string', description: 'Only list paths starting with this.', max: 200, default: '' } },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const ws = workspaceFor(ctx);
    if ('error' in ws) return ws;
    const prefix = String(args.prefix ?? '');
    if (prefix && !checkWorkspacePathLoose(prefix).ok) return { error: 'that prefix is not a usable path' };
    const files = await ws.list(prefix);
    return { prefix, count: files.length, files: files.slice(0, 200) };
  },
};

const workspaceReadTool: WebTool = {
  contract: {
    name: 'workspace_read',
    description: 'Read one file from this project\'s scratch workspace.',
    args: {
      path: { type: 'string', description: 'Relative path, e.g. notes/plan.md.', required: true, max: 200 },
      maxChars: { type: 'integer', description: 'Cap on returned content (default 4000).', min: 200, max: 20_000, default: 4000 },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const verdict = checkWorkspacePath(args.path as string);
    if (!verdict.ok) return { error: verdict.detail };
    const ws = workspaceFor(ctx);
    if ('error' in ws) return ws;
    const file = await ws.read(verdict.path);
    // A file that is not there is an ERROR rather than empty content. `{ content: '' }` is what a
    // real, empty file looks like, and the model cannot tell the two apart from the result alone.
    if (!file) return { error: `there is no file at ${verdict.path}`, path: verdict.path };
    const maxChars = args.maxChars as number;
    return {
      path: verdict.path,
      bytes: file.bytes,
      contentTruncated: file.content.length > maxChars,
      content: file.content.slice(0, maxChars),
    };
  },
};

const workspaceWriteTool: WebTool = {
  contract: {
    name: 'workspace_write',
    description: 'Write one file into this project\'s scratch workspace, replacing it if it exists. This never touches the Roblox place.',
    args: {
      path: { type: 'string', description: 'Relative path, e.g. notes/plan.md.', required: true, max: 200 },
      content: { type: 'string', description: 'The whole new contents of the file.', required: true, min: 0, max: WORKSPACE_MAX_BYTES, multiline: true },
    },
  },
  available: () => ({ ok: true }),
  async run(ctx, args) {
    const verdict = checkWorkspacePath(args.path as string);
    if (!verdict.ok) return { error: verdict.detail };
    const content = args.content as string;
    const bytes = new TextEncoder().encode(content).length;
    // DEFENCE IN DEPTH, AND NO TEST CAN REDDEN IT THROUGH runWebTool. The contract declares
    // `max: WORKSPACE_MAX_BYTES` on `content`, and validateArgs runs before this body, so every
    // request that reaches here has already been measured. Deleting this branch turns nothing red —
    // meaning 6 in docs/FAILURES.md F-58: the break is real and the behaviour is unchanged, because
    // a named second mechanism covers it.
    //
    // Kept because it is the only guard for a caller that reaches writeWorkspaceFile without going
    // through the contract. If you are simplifying this, the thing to verify is that the contract's
    // `max` on `content` is still there: that is what covers this one's absence, and it is the only
    // thing that does.
    if (bytes > WORKSPACE_MAX_BYTES) {
      return { error: `${bytes} bytes is larger than the ${WORKSPACE_MAX_BYTES}-byte workspace file limit` };
    }
    const ws = workspaceFor(ctx);
    if ('error' in ws) return ws;
    const written = await ws.write(verdict.path, content);
    return { path: verdict.path, bytes: written.bytes, created: written.created };
  },
};

/* --------------------------------------------------------------- the registry --- */

export const WEB_TOOLS: Record<string, WebTool> = {
  web_fetch: webFetchTool,
  browse_page: browsePageTool,
  web_search: webSearchTool,
  screenshot_page: screenshotTool,
  ocr_image: ocrTool,
  github_lookup: githubTool,
  git_history: gitTool,
  workspace_list: workspaceListTool,
  workspace_read: workspaceReadTool,
  workspace_write: workspaceWriteTool,
};

export const WEB_TOOL_NAMES = Object.keys(WEB_TOOLS);

/** The tools that only ever read. Plan mode may have these; it may never have a write. */
export const READ_ONLY_WEB_TOOLS: readonly string[] = [
  'web_fetch',
  'browse_page',
  'web_search',
  'screenshot_page',
  'ocr_image',
  'github_lookup',
  'git_history',
  'workspace_list',
  'workspace_read',
];

export function webToolDef(name: string): { name: string; description: string; parameters: unknown } {
  const tool = WEB_TOOLS[name];
  // Thrown at module load, where it stops a deploy, rather than returning undefined and shipping a
  // tool whose schema is missing — which a model answers by guessing arguments.
  if (!tool) throw new Error(`webToolDef: no such web tool ${name}`);
  return { name: tool.contract.name, description: tool.contract.description, parameters: contractParameters(tool.contract) };
}

/** Which web tools can do anything in this deployment, and the reason for each that cannot. */
export function webToolAvailability(env: Env): Record<string, { ok: boolean; why?: string }> {
  const out: Record<string, { ok: boolean; why?: string }> = {};
  for (const [name, tool] of Object.entries(WEB_TOOLS)) {
    const a = tool.available(env);
    out[name] = a.ok ? { ok: true } : { ok: false, why: a.why };
  }
  return out;
}

/**
 * Validate, then run.
 *
 * The only entry point. Validation happens HERE rather than in each tool, so a tool body can never
 * be reached with an argument nobody checked — which is the failure this whole file is built
 * around: for a Studio tool a bad argument is refused by Luau, and for these there is nothing
 * downstream to refuse it.
 */
export async function runWebTool(name: string, ctx: WebToolCtx, rawArgs: unknown): Promise<unknown> {
  const tool = WEB_TOOLS[name];
  if (!tool) return { error: `unknown web tool: ${name}` };
  const available = tool.available(ctx.env);
  if (!available.ok) return notConfigured(available.why);
  // Measured before validation, because the validator walks every declared key and a pathological
  // payload should cost nothing. A megabyte of "arguments" is not a call anyone meant to make.
  let size = 0;
  try {
    size = JSON.stringify(rawArgs ?? {}).length;
  } catch {
    // NOT A PARSE FAILURE, and the old wording ("could not be read as JSON at all") said it was.
    // By the time runWebTool is called, runTool has already parsed the argument string and refused
    // it by name if it would not parse — see tools.ts. What can still fail HERE is the reverse
    // direction: stringifying an object that is already in hand, which throws only on a circular
    // reference or a BigInt. Two different conditions wearing nearly the same sentence is worse
    // than either bug: the message tells you to go and check the model's JSON, which is fine.
    return {
      error: `${name}: the arguments cannot be measured — they contain a circular reference or a value JSON cannot represent`,
    };
  }
  if (size > MAX_ARGS_CHARS) {
    return { error: `${name}: ${size} characters of arguments is past the ${MAX_ARGS_CHARS}-character limit` };
  }
  const validated = validateArgs(tool.contract, rawArgs);
  if (!validated.ok) return { error: errorsToMessage(tool.contract, validated.errors), invalidArguments: validated.errors };
  return tool.run(ctx, validated.args);
}
