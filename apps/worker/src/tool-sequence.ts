/** A user's explicit, finite tool workflow. This never widens tool permissions. */
export function explicitToolSequence(request: string, known: ReadonlySet<string>): string[] | null {
  // Require a standalone instruction, named tools and an explicit ending. Ordinary prose about
  // a game, or tool names inside a quoted/code example, must not turn off normal autonomy.
  const prose = request.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const matches = [...prose.matchAll(/(?:^|[.!?\n])\s*Exactly\s+([a-z][a-z_]*(?:\s+then\s+[a-z][a-z_]*)*)\s+then\s+finish\s*(?=[.!?\n]|$)/gi)];
  // Natural single-call wording must also close the allowance. The optional inline
  // payload is validated as JSON so examples or intervening instructions cannot bind it.
  const single = [...prose.matchAll(/(?:^|[.!?\n])\s*(?:Make|Execute)\s+exactly\s+(?:one|1)\s+([a-z][a-z_]*)\s+call(?:\s+with\s+(\{[^\n]*\}))?\s*(?:\.\s*Then|,\s*then)\s+finish(?:\s+immediately)?\s*(?=[.!?\n]|$)/gi)];
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
export function sequenceProgress(sequence: readonly string[], trace: readonly { tool: string; ok: boolean }[], executedThisStep?: number):
  { state: 'next'; tool: string } | { state: 'complete' | 'failed' } {
  if (executedThisStep === 0 || trace.length > sequence.length || trace.some((entry, i) => !entry.ok || entry.tool !== sequence[i])) {
    return { state: 'failed' };
  }
  return trace.length === sequence.length
    ? { state: 'complete' }
    : { state: 'next', tool: sequence[trace.length]! };
}

/** Build the provider transcript for the next finite action. */
export function sequenceStepMessages<T extends { role: string; content: unknown; pinned?: boolean; toolCalls?: unknown[] }>(messages: readonly T[], tool: string): T[] {
  // In two live runs the model copied an earlier run's canned completion verbatim and
  // returned no tool call. Remove only that historical terminal prose; user facts,
  // real tool results and the pinned current request remain unchanged. No paid retry.
  let current = -1;
  messages.forEach((message, index) => { if (message.role === 'user' && message.pinned === true) current = index; });
  const kept = messages.filter((message, index) => !(
    current >= 0 && index < current && message.role === 'assistant' &&
    !message.toolCalls?.length && typeof message.content === 'string' &&
    message.content.startsWith('The tool sequence you requested is complete.')
  ));
  return kept.map((message, index) => index === 0 && message.role === 'system'
    ? { ...message, content: `${message.content}\n\nNext required action: ${tool}. Call that tool now using the latest user request and verified results from this run. Do not claim changes based on earlier messages. No additional tools are authorized by this workflow.` }
    : message);
}

/** Calls at different explicitly authorized sequence positions are distinct work. */
export function sequenceCallSignature(name: string, args: string, position?: number): string {
  return position === undefined ? `${name}:${args}` : `finite:${position}:${name}:${args}`;
}
