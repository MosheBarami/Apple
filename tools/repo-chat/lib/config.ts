import path from "node:path";
import os from "node:os";

/** Absolute, normalised repo root. Read from REPO_ROOT (Next loads .env.local). */
export function repoRoot(): string {
  const raw = process.env.REPO_ROOT;
  if (!raw) throw new Error("REPO_ROOT is not set (see .env.example)");
  return path.resolve(raw);
}

export function modelId(): string {
  return process.env.REPO_CHAT_MODEL || "stealth/space-bunny-alpha";
}

/** The owner's project memory (read-only, indexed by the knowledge base). */
export function memoryDir(): string {
  return (
    process.env.REPO_CHAT_MEMORY_DIR ||
    path.join(os.homedir(), ".claude", "projects", "-Users-moshe-Developer-RbxAI", "memory")
  );
}

/** Where the BM25 index lives (gitignored). */
export function indexDir(): string {
  return process.env.REPO_CHAT_INDEX_DIR || path.join(process.cwd(), ".index");
}

export function skillsDir(): string {
  return path.join(process.cwd(), "skills");
}

export const PORT = 4790;
