/**
 * Rendering a conversation into a file the user keeps.
 *
 * WHY THIS IS ITS OWN MODULE. The route could assemble the Markdown inline, and then the only way
 * to test it would be to grep the route's source for the strings it emits — an oracle that passes
 * on a renderer which never runs. Here the functions are called for real by the tests, so a
 * transcript that drops messages or a filename that escapes its header FAILS rather than matching a
 * regex. Both formats are produced from the same `TranscriptExport`, so the JSON and the Markdown
 * cannot disagree about what the conversation was.
 */

export interface TranscriptMessage {
  id: string;
  role: string;
  mode: string | null;
  content: string;
  toolTrace: unknown;
  createdAt: string;
}

export interface TranscriptExport {
  project: { id: string | null; name: string | null };
  exportedAt: string;
  messageCount: number;
  totalMessages: number;
  truncated: boolean;
  messages: TranscriptMessage[];
}

/** What a role is called in a file a person reads, rather than what the column stores. */
function speaker(role: string): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'Apple';
  if (role === 'system') return 'System';
  return role;
}

/**
 * Markup inside a `<details>` block is HTML, so a tool summary containing `</details>` would close
 * the block early and spill the rest of the run into the page as raw markup. The trace is
 * machine-written but it quotes user content — file names, error text — so it is not trusted here.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A tool trace row, defensively read: this is persisted JSON from older schema versions too. */
function traceRows(trace: unknown): { tool: string; summary: string; ok: boolean }[] {
  if (!Array.isArray(trace)) return [];
  return trace.map((t) => {
    const r = (t ?? {}) as Record<string, unknown>;
    return {
      tool: typeof r.tool === 'string' ? r.tool : typeof r.name === 'string' ? r.name : 'unknown',
      summary: typeof r.summary === 'string' ? r.summary : typeof r.detail === 'string' ? r.detail : '',
      // Absent means it ran; only an explicit false is a failure. Defaulting the other way would
      // print a transcript in which every historic run appears to have failed.
      ok: r.ok !== false,
    };
  });
}

/**
 * The whole transcript as Markdown.
 *
 * Every message in `data.messages` is rendered — there is no second cap here. If the DO clipped the
 * transcript, the banner says so at the top, where someone reading the file sees it before they
 * conclude it is complete.
 */
export function renderTranscriptMarkdown(data: TranscriptExport): string {
  const out: string[] = [];
  out.push(`# ${data.project.name ?? 'Untitled project'}`, '');
  out.push(`Exported ${data.exportedAt} · ${data.messageCount} of ${data.totalMessages} messages`, '');
  if (data.truncated) {
    out.push(
      `> **This export is incomplete.** It holds the first ${data.messageCount} of ${data.totalMessages} messages.`,
      '',
    );
  }

  for (const m of data.messages) {
    out.push(`## ${speaker(m.role)}${m.mode ? ` · ${m.mode}` : ''}`);
    out.push('', `*${m.createdAt}*`, '');
    // Content is written verbatim: the user wrote Markdown and should get their Markdown back.
    out.push(m.content, '');

    const rows = traceRows(m.toolTrace);
    if (rows.length) {
      out.push('<details><summary>What ran</summary>', '');
      for (const r of rows) {
        const mark = r.ok ? 'ok' : 'FAILED';
        const tail = r.summary ? ` — ${escapeHtml(r.summary)}` : '';
        out.push(`- ${mark} · \`${escapeHtml(r.tool)}\`${tail}`);
      }
      out.push('', '</details>', '');
    }
  }
  return out.join('\n');
}

/**
 * A download filename derived from the project name.
 *
 * The name is user-controlled and lands in a `Content-Disposition` header, so anything that is not
 * an unreserved ASCII character is dropped rather than escaped: a quote would end the quoted
 * string, and a CR or LF would end the header and start another one. Dropping is safe by
 * construction in a way that escaping is only safe if every escape is right.
 */
export function exportFilename(projectName: string | null, exportedAt: string, ext: 'json' | 'md'): string {
  const slug =
    (projectName ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'project';
  const stamp = /^\d{4}-\d{2}-\d{2}/.test(exportedAt) ? exportedAt.slice(0, 10) : 'export';
  return `${slug}-${stamp}.${ext}`;
}
