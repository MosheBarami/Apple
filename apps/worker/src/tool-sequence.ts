/** A user's explicit, finite tool workflow. This never widens tool permissions. */
export function explicitToolSequence(request: string, known: ReadonlySet<string>): string[] | null {
  // Require a standalone instruction, named tools and an explicit ending. Ordinary prose about
  // a game, or tool names inside a quoted/code example, must not turn off normal autonomy.
  const prose = request.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const matches = [...prose.matchAll(/(?:^|[.!?\n])\s*Exactly\s+([a-z][a-z_]*(?:\s+then\s+[a-z][a-z_]*)*)\s+then\s+finish\s*(?=[.!?\n]|$)/gi)];
  // Natural single-call wording must also close the allowance. The optional inline
  // payload is validated as JSON so examples or intervening instructions cannot bind it.
  const single = [...prose.matchAll(/(?:^|[.!?\n])\s*Make\s+exactly\s+(?:one|1)\s+([a-z][a-z_]*)\s+call(?:\s+with\s+(\{[^\n]*\}))?\s*\.\s*Then\s+finish\s*(?=[.!?\n]|$)/gi)];
  if (matches.length + single.length !== 1) return null;
  if (single.length) {
    const match = single[0]!;
    if (match[2]) {
      try { JSON.parse(match[2]); } catch { return null; }
    }
    const tool = match[1]!.toLowerCase();
    return known.has(tool) ? [tool] : null;
  }
  const tools = matches[0]![1]!.toLowerCase().split(/\s+then\s+/);
  return tools.length <= 8 && tools.every((tool) => known.has(tool)) ? tools : null;
}

/** Persisted trace is the authority, so eviction cannot reset the workflow allowance. */
export function sequenceProgress(sequence: readonly string[], trace: readonly { tool: string; ok: boolean }[]):
  { state: 'next'; tool: string } | { state: 'complete' | 'failed' } {
  if (trace.length > sequence.length || trace.some((entry, i) => !entry.ok || entry.tool !== sequence[i])) {
    return { state: 'failed' };
  }
  return trace.length === sequence.length
    ? { state: 'complete' }
    : { state: 'next', tool: sequence[trace.length]! };
}
