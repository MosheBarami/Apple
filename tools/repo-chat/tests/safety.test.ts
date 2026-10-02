import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSensitivePath, redact, redactDeep, resolveInRepo, SafetyError, validatePathspec } from "@/lib/safety";
import { listDir, readFile, searchCode } from "@/lib/repo-tools";

let tmp: string;
let root: string;
let outside: string;

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "repo-chat-test-")));
  root = path.join(tmp, "repo");
  outside = path.join(tmp, "outside");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules/x"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, "src/a.ts"), "export const a = 1;\nexport const needle = 'findme';\n");
  fs.writeFileSync(path.join(root, ".env.local"), "OPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwxyz\n");
  fs.writeFileSync(path.join(root, "src/my-secrets.txt"), "findme in a secret file\n");
  fs.writeFileSync(path.join(root, "src/server.pem"), "findme pem\n");
  fs.writeFileSync(path.join(root, "node_modules/x/index.js"), "findme in node_modules\n");
  fs.writeFileSync(path.join(root, "src/token.ts"), "const k = 'findme';\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n");
  fs.writeFileSync(path.join(outside, "passwd.txt"), "root:x:0:0 findme\n");
  fs.symlinkSync(outside, path.join(root, "src/link-dir"));
  fs.symlinkSync(path.join(outside, "passwd.txt"), path.join(root, "src/link-file.txt"));
  fs.symlinkSync(path.join(root, "src/a.ts"), path.join(root, "src/inside-link.ts"));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("resolveInRepo", () => {
  it("accepts a normal path and a symlink that stays inside", () => {
    expect(resolveInRepo("src/a.ts", root).rel).toBe("src/a.ts");
    expect(resolveInRepo("src/inside-link.ts", root).rel).toBe("src/a.ts");
  });
  it("rejects ../ traversal", () => {
    expect(() => resolveInRepo("../outside/passwd.txt", root)).toThrow(SafetyError);
    expect(() => resolveInRepo("src/../../outside/passwd.txt", root)).toThrow(SafetyError);
    expect(() => resolveInRepo("src/../../../../etc/passwd", root)).toThrow(SafetyError);
  });
  it("rejects absolute paths outside the root", () => {
    expect(() => resolveInRepo("/etc/passwd", root)).toThrow(SafetyError);
    expect(() => resolveInRepo(path.join(outside, "passwd.txt"), root)).toThrow(SafetyError);
  });
  it("rejects a symlinked file and a symlinked directory that point outside", () => {
    expect(() => resolveInRepo("src/link-file.txt", root)).toThrow(/outside the repo root/);
    expect(() => resolveInRepo("src/link-dir/passwd.txt", root)).toThrow(/outside the repo root/);
    expect(() => readFile(root, "src/link-file.txt")).toThrow(SafetyError);
    expect(() => listDir(root, "src/link-dir")).toThrow(SafetyError);
  });
  it("rejects NUL bytes and empty paths", () => {
    expect(() => resolveInRepo("src/a.ts\0.txt", root)).toThrow(SafetyError);
    expect(() => resolveInRepo("", root)).toThrow(SafetyError);
  });
  it("refuses .env.local and other secret-looking files", () => {
    expect(() => resolveInRepo(".env.local", root)).toThrow(/secret|credential/);
    expect(() => readFile(root, ".env.local")).toThrow(SafetyError);
    expect(() => readFile(root, "src/server.pem")).toThrow(SafetyError);
    expect(() => readFile(root, "src/my-secrets.txt")).toThrow(SafetyError);
  });
  it("reports a missing file as not found", () => {
    expect(() => resolveInRepo("src/nope.ts", root)).toThrow(/not found/);
  });
});

describe("isSensitivePath", () => {
  it.each([
    [".env", true], [".env.local", true], [".env.production", true], ["apps/worker/.dev.vars", true],
    ["x/prod.dev.vars", true], ["certs/a.pem", true], ["certs/b.key", true], ["docs/client-credentials.md", true],
    ["docs/SECRETS.md", true], [".git/config", true], ["a/.ssh/id_rsa", true], [".npmrc", true],
    ["src/a.ts", false], ["docs/DECISIONS.md", false], ["apps/site/public/favicon.svg", false],
  ])("%s -> %s", (p, expected) => expect(isSensitivePath(p)).toBe(expected));
  it("treats ~/.ssh as sensitive", () => {
    expect(isSensitivePath(path.join(os.homedir(), ".ssh", "known_hosts"))).toBe(true);
  });
});

describe("validatePathspec (git paths)", () => {
  it("rejects traversal, absolute, option-like and sensitive pathspecs", () => {
    expect(() => validatePathspec("../x")).toThrow(SafetyError);
    expect(() => validatePathspec("/etc/passwd")).toThrow(SafetyError);
    expect(() => validatePathspec("--output=/tmp/x")).toThrow(SafetyError);
    expect(() => validatePathspec(".env.local")).toThrow(SafetyError);
    expect(validatePathspec("apps/worker/src/tools.ts")).toBe("apps/worker/src/tools.ts");
  });
});

describe("redact", () => {
  const fakeOr = "sk-or-v1-" + "a1b2c3d4e5f6".repeat(5);
  it("masks OpenRouter / OpenAI style keys", () => {
    const out = redact(`key is ${fakeOr} and sk-proj-abcdefghijklmnop1234`);
    expect(out).not.toContain(fakeOr);
    expect(out).not.toContain("a1b2c3d4e5f6");
    expect(out).toContain("[REDACTED]");
  });
  it("masks ghp_, JWT, AKIA and Bearer tokens", () => {
    const ghp = "ghp_" + "A".repeat(36);
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const akia = "AKIAIOSFODNN7EXAMPLE";
    const out = redact(`${ghp} ${jwt} ${akia} Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789`);
    for (const s of [ghp, jwt, akia, "abcdefghijklmnopqrstuvwxyz0123456789"]) expect(out).not.toContain(s);
  });
  it("masks KEY= lines but leaves ordinary code alone", () => {
    const out = redact("OPENROUTER_API_KEY=supersecretvalue123\nconst apiKey: string = x;\nexport const MAX_TOKENS = 4096;");
    expect(out).toContain("OPENROUTER_API_KEY=[REDACTED]");
    expect(out).not.toContain("supersecretvalue123");
    expect(out).toContain("const apiKey: string = x;");
    expect(out).toContain("MAX_TOKENS = 4096");
  });
  it("masks PEM private keys", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
    expect(redact(`x\n${pem}\ny`)).not.toContain("MIIEvQ");
  });
  it("redactDeep reaches nested strings", () => {
    const o = redactDeep({ a: [{ b: fakeOr }] });
    expect(JSON.stringify(o)).not.toContain("a1b2c3d4e5f6");
  });
});

describe("tools end to end on a temp repo", () => {
  it("read_file redacts secrets in file content", () => {
    const r = readFile(root, "src/token.ts");
    expect(r.content).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(r.content).toContain("[REDACTED]");
  });
  it("read_file caps the line range", () => {
    fs.writeFileSync(path.join(root, "big.txt"), Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n"));
    const r = readFile(root, "big.txt", 10, 900);
    expect(r.endLine - r.startLine + 1).toBeLessThanOrEqual(400);
    expect(r.truncated).toBe(true);
    expect(r.note).toMatch(/continue with startLine=/);
  });
  for (const engine of ["auto", "js"] as const) {
    it(`search_code (${engine}) skips node_modules, secrets, keys and symlink targets`, async () => {
      const r = await searchCode(root, { query: "findme", engine });
      const paths = r.hits.map((h) => h.path);
      expect(paths).toContain("src/a.ts");
      expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
      expect(paths.some((p) => /secret|\.pem|\.env/.test(p))).toBe(false);
      expect(paths.some((p) => p.includes("link-"))).toBe(false);
    });
  }
  it("search_code refuses a glob that tries to leave the repo", async () => {
    await expect(searchCode(root, { query: "findme", glob: "../**" })).rejects.toThrow(SafetyError);
  });
  it("list_dir hides node_modules and secret files and the symlinked dir", () => {
    const r = listDir(root, ".", 2);
    expect(r.tree).not.toMatch(/node_modules|\.env|secrets|\.pem|link-/);
    expect(r.tree).toContain("a.ts");
  });
});
