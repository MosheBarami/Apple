export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Build or refresh the knowledge index at startup (rebuilds only if source files changed).
    const { ensureIndex } = await import("./lib/knowledge");
    try {
      const s = ensureIndex();
      console.log(`[repo-chat] knowledge index: ${s.files} files, ${s.chunks} chunks (${s.rebuilt ? "rebuilt" : "up to date"}, ${s.ms} ms)`);
    } catch (e) {
      console.warn("[repo-chat] knowledge index failed:", (e as Error).message);
    }
  }
}
