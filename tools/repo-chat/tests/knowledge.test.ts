import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkMarkdown } from "@/lib/knowledge";

describe("chunkMarkdown", () => {
  const md = ["# Title", "intro", "", "## Section A", "alpha text", "```", "# not a heading", "```", "", "## Section B", "beta text"].join("\n");
  it("splits by heading with 1-based line ranges and ignores headings in fences", () => {
    const c = chunkMarkdown("docs/x.md", md, 0);
    expect(c.map((x) => x.title)).toEqual(["x.md > Title", "x.md > Title > Section A", "x.md > Title > Section B"]);
    expect(c[1].startLine).toBe(4);
    expect(c[1].endLine).toBe(9);
    expect(c[1].text).toContain("# not a heading");
    expect(c[2].startLine).toBe(10);
  });
});

describe("knowledge index (isolated temp repo)", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "repo-chat-kb-")));
    fs.mkdirSync(path.join(tmp, "repo/docs"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "mem"));
    fs.writeFileSync(path.join(tmp, "repo/README.md"), "# Repo\n\nThe tool registry lives in tools.ts.\n");
    fs.writeFileSync(path.join(tmp, "repo/docs/DECISIONS.md"), "# ADR\n\n## ADR-001 Brand\nWe picked the name StudPilot.\n");
    fs.writeFileSync(path.join(tmp, "repo/docs/secrets-notes.md"), "# hidden\nzzqxhidden\n");
    fs.writeFileSync(path.join(tmp, "mem/pref.md"), "---\nname: pref\n---\nOwner prefers hebrew replies.\n");
    process.env.REPO_ROOT = path.join(tmp, "repo");
    process.env.REPO_CHAT_MEMORY_DIR = path.join(tmp, "mem");
    process.env.REPO_CHAT_INDEX_DIR = path.join(tmp, "idx");
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("indexes repo docs and memory, skips secret-named docs, and rebuilds on change", async () => {
    const { ensureIndex, searchKnowledge } = await import("@/lib/knowledge");
    const s1 = ensureIndex({ force: true });
    expect(s1.files).toBe(3);
    const r = searchKnowledge("tool registry");
    expect(r.hits[0].path).toBe("README.md");
    expect(r.hits[0].startLine).toBe(1);
    expect(searchKnowledge("hebrew").hits[0].path).toBe("memory/pref.md");
    expect(searchKnowledge("zzqxhidden").hits.length).toBe(0);
    // unchanged: no rebuild; changed mtime/size: rebuild
    expect(ensureIndex().rebuilt).toBe(false);
    fs.writeFileSync(path.join(tmp, "repo/docs/NEW.md"), "# New\nfresh content zebra\n");
    const s2 = ensureIndex({ force: false });
    // 20 s throttle: force a recheck the way /api/reindex would
    const s3 = s2.files === 4 ? s2 : ensureIndex({ force: true });
    expect(s3.files).toBe(4);
    expect(searchKnowledge("zebra").hits[0].path).toBe("docs/NEW.md");
  });
});
