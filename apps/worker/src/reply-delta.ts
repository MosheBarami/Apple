/**
 * WHAT THE LIVE STREAM STILL NEEDS TO READ LIKE THE STORED REPLY — and not a character more.
 *
 * finishRun stores ONE reply: the last step's text (or a closing the product wrote instead of it),
 * plus the refund and remedy sentences. The live stream has meanwhile shown every step's text. The
 * old reconciliation, `final.slice(streamed.length) || '\n' + final`, assumed the stream was a
 * prefix of the reply. On any run that spoke in more than one step it was not, so the WHOLE reply
 * was sent again and read twice live (F-045, 2026-09-23: a "Fixed. …" reply appeared twice). And
 * where the reply was merely longer, it cut the reply at an arbitrary character.
 *
 * So: when the stream already ENDS with a leading run of whole paragraphs of the reply, only the
 * paragraphs after them are sent. When it does not (the reply is a closing the product wrote in
 * place of the model's text), the reply is sent once as a new paragraph. msg_end carries the stored
 * reply itself, which is what a client settles on; this keeps every delta-reading client — the SDK,
 * the infra probes — from reading anything twice.
 */
export function replyDelta(streamed: string, final: string): string {
  if (!final || final === streamed) return '';
  if (!streamed) return final;
  if (final.startsWith(streamed)) return final.slice(streamed.length);
  // Candidate heads end at paragraph boundaries only, so a stream that happens to end in the same
  // letter as the reply begins with cannot splice the two mid-word.
  for (let at = final.length; at > 0; at = final.lastIndexOf('\n\n', at - 1)) {
    const head = final.slice(0, at);
    if (head.trim() && streamed.endsWith(head)) return final.slice(at);
  }
  return `\n\n${final}`;
}
