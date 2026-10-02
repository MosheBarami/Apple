/**
 * Client-side evidence index for one assistant message: which files and lines its tool calls
 * actually returned. Used to check the model's path:line citations against what it really saw.
 */
import type { UIMessage } from "ai";

export const CITATION_RE = /^([A-Za-z0-9_@.+\-/]+\.[A-Za-z0-9]{1,8}):(\d+)(?:[-–](\d+))?$/;

export type Verdict = "verified" | "file-seen" | "unverified";
export type Evidence = {
  /** every source title the tools reported (path:range) */
  sources: Array<{ path: string; start?: number; end?: number; title: string }>;
  check: (path: string, line: number) => { verdict: Verdict; quote?: string };
};

type AnyPart = { type: string; [k: string]: unknown };

export function buildEvidence(message: UIMessage | undefined): Evidence {
  const sources: Evidence["sources"] = [];
  const lineText = new Map<string, string>();
  if (message) {
    for (const p of message.parts as AnyPart[]) {
      if (p.type === "source-document") {
        const title = String(p.title ?? "");
        const path = String(p.filename ?? title);
        const m = /:(\d+)(?:-(\d+))?$/.exec(title);
        sources.push({ path, start: m ? Number(m[1]) : undefined, end: m ? Number(m[2] ?? m[1]) : undefined, title });
      } else if (p.type.startsWith("tool-") && typeof p.output === "string") {
        const out = p.output as string;
        const input = (p.input ?? {}) as { path?: string };
        if (p.type === "tool-read_file" && input.path) {
          const header = /^(\S+) lines/.exec(out);
          const path = header?.[1] ?? input.path;
          for (const l of out.split("\n").slice(1)) {
            const m = /^\s*(\d+)\| (.*)$/.exec(l);
            if (m) lineText.set(`${path}:${m[1]}`, m[2]);
          }
        } else if (p.type === "tool-search_code") {
          for (const l of out.split("\n").slice(1)) {
            const m = /^(.+?):(\d+): (.*)$/.exec(l);
            if (m) lineText.set(`${m[1]}:${m[2]}`, m[3]);
          }
        }
      }
    }
  }
  const paths = new Set(sources.map((s) => s.path));
  for (const k of lineText.keys()) paths.add(k.slice(0, k.lastIndexOf(":")));
  return {
    sources,
    check(cited, line) {
      // the model sometimes cites a bare file name; accept it if exactly one touched file ends with it
      let path = cited;
      if (!paths.has(path)) {
        const matches = [...paths].filter((p) => p.endsWith("/" + cited));
        if (matches.length === 1) path = matches[0];
      }
      const quote = lineText.get(`${path}:${line}`);
      if (quote !== undefined) return { verdict: "verified", quote };
      const inRange = sources.some((s) => s.path === path && s.start !== undefined && line >= s.start && line <= (s.end ?? s.start));
      if (inRange) return { verdict: "verified" };
      return { verdict: paths.has(path) ? "file-seen" : "unverified" };
    },
  };
}
