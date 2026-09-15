// What may be attached to a message, and what the model is told about it.
//
// This file exists because `ChatAttachment` did not. There was an interface in index.ts with a
// `kind`, a `mime` and a `size`, and nothing in the repository that ever set one, checked one or
// read one — so "attachment type validation" and "attachment size validation" were fields, not
// rules. A limit nothing enforces is a comment.
//
// BOTH ENDS ENFORCE THE SAME NUMBERS, FROM HERE. The browser refuses a file before it spends the
// person's upload on it; the worker refuses it again because the browser is not a security
// boundary. Two copies of a ceiling drift, and the symptom is a file the picker accepted and the
// server rejected with no sentence attached. This is the rule MESSAGE_MAX_CHARS already lives by,
// applied to the other thing a message can carry.
//
// WHAT THIS BUILD CAN ACTUALLY READ. An attachment on this build is folded into the prompt as
// text (see foldAttachmentsIntoPrompt, called from the session Durable Object). That is the whole
// mechanism, and the allowlist is drawn from it rather than from a wish: every admitted type is
// one that decodes to characters a model can read. Images and audio are refused BY NAME for the
// same reason — an image accepted into a message that then silently drops it costs the person a
// whole run before they discover it was never looked at.

/**
 * The ceiling on one attachment, in bytes.
 *
 * 32 KiB, and the number is a consequence rather than a preference: the file's text is folded
 * into the prompt, so the ceiling on a file is a ceiling on a bill. 32 KiB of source is a long
 * module; it is also about 8,000 tokens, which is the same order as MESSAGE_MAX_CHARS. Raising it
 * is a budget decision, not a UI one.
 */
export const MAX_ATTACHMENT_BYTES = 32 * 1024;

/** How many files may ride on one message. Four is two more than anyone has ever needed at once. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/**
 * How much attached text may reach the model with one message, across ALL of its attachments.
 *
 * Shared, not per-file: four files each granted the full budget is four times the bill the number
 * was chosen to cap.
 */
export const ATTACHMENT_PROMPT_BUDGET_CHARS = 24_000;

/**
 * The types this build admits.
 *
 * Every one of them decodes to text. `text/x-lua` covers .lua and .luau, which is the format a
 * Roblox builder is most likely to paste in and the one the agent can act on directly.
 */
export const ATTACHMENT_MIME_ALLOWLIST = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/x-lua',
] as const;

export type AttachmentMime = (typeof ATTACHMENT_MIME_ALLOWLIST)[number];

/**
 * Extension → type, because the browser frequently declares nothing at all.
 *
 * Chrome sends an empty string for .luau and .md on most platforms and `application/octet-stream`
 * for anything it does not recognise. Reading a bare '' as "unknown binary" would refuse exactly
 * the files this feature exists for.
 */
export const ATTACHMENT_EXTENSION_MIME: Readonly<Record<string, AttachmentMime>> = {
  txt: 'text/plain',
  text: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  lua: 'text/x-lua',
  luau: 'text/x-lua',
};

/**
 * The `accept` attribute for the file picker — built from the allowlist, never written out beside
 * it. A dialog that offers a type the server refuses is a dialog that lies about what it takes.
 */
export const ATTACHMENT_ACCEPT = [
  ...ATTACHMENT_MIME_ALLOWLIST,
  ...Object.keys(ATTACHMENT_EXTENSION_MIME).map((ext) => `.${ext}`),
].join(',');

/** Why an attachment was refused. Each one has a sentence; none of them is a generic failure. */
export type AttachmentRefusal =
  | 'empty'
  | 'too_large'
  | 'too_many'
  | 'image_unsupported'
  | 'audio_unsupported'
  | 'type_not_allowed'
  | 'not_text';

export type AttachmentVerdict =
  | { ok: true; name: string; mime: AttachmentMime; kind: 'file'; size: number }
  | { ok: false; reason: AttachmentRefusal; message: string };

/** Bytes as a person reads them, so a refusal can state the ceiling in the units of the dialog. */
export function attachmentSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10} KB`;
  return `${Math.round((kb / 1024) * 10) / 10} MB`;
}

/**
 * The sentence the person reads. Written here so the composer, the worker and any future surface
 * all refuse a file in the same words — a refusal phrased two ways reads as two different bugs.
 */
export function attachmentRefusalMessage(reason: AttachmentRefusal, detail?: { name?: string; format?: string }): string {
  const named = detail?.name ? `“${detail.name}”` : 'That file';
  switch (reason) {
    case 'empty':
      return `${named} is empty — there is nothing in it to read.`;
    case 'too_large':
      return `${named} is larger than ${attachmentSizeLabel(MAX_ATTACHMENT_BYTES)}. Attach the part that matters, or paste it into the message.`;
    case 'too_many':
      return `You can attach ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message. Remove one first.`;
    case 'image_unsupported':
      return `Apple can’t read images yet, so ${named} wouldn’t be looked at. Describe what’s in it, or paste the code.`;
    case 'audio_unsupported':
      return `Apple can’t listen to audio yet, so ${named} wouldn’t be heard. Type what you wanted to say.`;
    case 'not_text':
      return detail?.format
        ? `${named} is a ${detail.format} file, whatever it is named — Apple can only read text files.`
        : `${named} isn’t text, whatever it is named — Apple can only read text files.`;
    case 'type_not_allowed':
    default:
      return `Apple can’t read ${named}. Text, Markdown, CSV, JSON and Luau files are the ones it can.`;
  }
}

/**
 * The type without its parameters, lowercased.
 *
 * `split(';')[0]` is `string | undefined` under noUncheckedIndexedAccess even though a split
 * never returns an empty array, and both call sites below need the same three operations.
 */
function bareMime(declared: string | undefined): string {
  const [first] = (declared ?? '').split(';');
  return (first ?? '').trim().toLowerCase();
}

/**
 * Characters that must not survive into a filename: C0 controls, DEL, and the double quote
 * that would end the value early inside a Content-Disposition header.
 */
const ATTACHMENT_NAME_STRIP = /[\u0000-\u001f\u007f"]/g;

/** A filename, never a path: separators are the uploader's directory layout and are not ours. */
export function cleanAttachmentName(raw: string): string {
  const base = raw.trim().split(/[\\/]/).pop() ?? '';
  // Control characters out: this string ends up in a Content-Disposition header and in a prompt.
  const stripped = base.replace(ATTACHMENT_NAME_STRIP, '').trim();
  return (stripped || 'attachment').slice(0, 120);
}

function extensionOf(name: string): string {
  const base = cleanAttachmentName(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * The admissible type for a file, or null when there is none.
 *
 * The extension is consulted FIRST when the declaration is missing or generic, and the declared
 * type is only trusted to the extent that it appears in the allowlist. Neither is evidence about
 * the bytes — that is what the sniffer below is for.
 */
export function attachmentMimeFor(name: string, declared?: string): AttachmentMime | null {
  const ext = extensionOf(name);
  const byExt = ATTACHMENT_EXTENSION_MIME[ext] ?? null;
  const bare = bareMime(declared);
  if (bare && (ATTACHMENT_MIME_ALLOWLIST as readonly string[]).includes(bare)) return bare as AttachmentMime;
  return byExt;
}

/** The magic numbers worth naming. Order matters only in that every entry is checked in turn. */
const MAGIC: { format: string; bytes: number[]; at?: number }[] = [
  { format: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { format: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { format: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },
  { format: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { format: 'GZIP', bytes: [0x1f, 0x8b] },
  { format: 'WEBP', bytes: [0x57, 0x45, 0x42, 0x50], at: 8 },
  { format: 'RBXM', bytes: [0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21] }, // "<roblox!"
];

/**
 * What the leading bytes say this is, or null for "nothing recognised".
 *
 * THE DECLARED TYPE IS NOT EVIDENCE. An allowlist checked only against the Content-Type header is
 * a naming convention with a security-sounding name: the uploader picks that value.
 */
export function sniffAttachmentFormat(head: Uint8Array): string | null {
  for (const m of MAGIC) {
    const at = m.at ?? 0;
    if (head.length < at + m.bytes.length) continue;
    if (m.bytes.every((b, i) => head[at + i] === b)) return m.format;
  }
  return null;
}

const BOM = [0xef, 0xbb, 0xbf];

/**
 * The file as characters, or null when it is not text.
 *
 * Strict UTF-8: a lenient decode turns a truncated sequence into U+FFFD, and a prompt full of
 * replacement characters is a file the model was handed and cannot read. The BOM is stripped
 * rather than carried, because it is a byte-order marker and not part of anybody's document.
 */
export function decodeAttachmentText(raw: Uint8Array): string | null {
  const hasBom = raw.length >= 3 && BOM.every((b, i) => raw[i] === b);
  const body = hasBom ? raw.subarray(3) : raw;
  if (body.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body);
  } catch {
    return null;
  }
}

/**
 * The whole rule, in one call, used by the composer before an upload and by the worker after one.
 *
 * `bytes` is optional only for the browser's pre-flight, where the size and the name are known
 * before the file has been read. The server ALWAYS passes bytes: a verdict reached without
 * looking at the content is a verdict about a filename.
 */
export function validateAttachment(input: {
  name: string;
  declaredMime?: string;
  size?: number;
  bytes?: Uint8Array;
}): AttachmentVerdict {
  const name = cleanAttachmentName(input.name);
  const size = input.bytes ? input.bytes.byteLength : (input.size ?? 0);
  const declared = bareMime(input.declaredMime);

  if (size <= 0) return { ok: false, reason: 'empty', message: attachmentRefusalMessage('empty', { name }) };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'too_large', message: attachmentRefusalMessage('too_large', { name }) };

  // Named before the generic refusal, because "Apple can't read images yet" is the true and
  // actionable sentence and "that type isn't allowed" is neither.
  const imageish = declared.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif'].includes(extensionOf(name));
  if (imageish) return { ok: false, reason: 'image_unsupported', message: attachmentRefusalMessage('image_unsupported', { name }) };
  const audioish = declared.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'webm', 'flac'].includes(extensionOf(name));
  if (audioish) return { ok: false, reason: 'audio_unsupported', message: attachmentRefusalMessage('audio_unsupported', { name }) };

  const mime = attachmentMimeFor(name, declared);
  if (!mime) return { ok: false, reason: 'type_not_allowed', message: attachmentRefusalMessage('type_not_allowed', { name }) };

  if (input.bytes) {
    const format = sniffAttachmentFormat(input.bytes.subarray(0, 32));
    if (format) return { ok: false, reason: 'not_text', message: attachmentRefusalMessage('not_text', { name, format }) };
    if (decodeAttachmentText(input.bytes) === null) {
      return { ok: false, reason: 'not_text', message: attachmentRefusalMessage('not_text', { name }) };
    }
  }

  return { ok: true, name, mime, kind: 'file', size };
}

/** One attachment as the fold sees it. `text: null` means the bytes could not be read back. */
export interface FoldableAttachment {
  name: string;
  mime: string;
  text: string | null;
  /**
   * WHY the text is null, when the caller knows.
   *
   * Absent means the bytes were not there — expired, or removed. `over_limit` means the file was
   * past MAX_ATTACHMENTS_PER_MESSAGE and was never fetched. The two get different sentences
   * because they need different actions from the person: wait-and-reattach against send-fewer.
   */
  absence?: 'over_limit';
}

/**
 * Put the attached files into the message the model is given.
 *
 * This is the whole mechanism by which an attachment has any effect on this build, which is why
 * it is a pure function with tests rather than three lines inside the Durable Object.
 *
 * TWO RULES IT MUST NOT BREAK:
 *
 *   The budget is shared. Per-file budgets multiply the bill by the number of files.
 *
 *   A file that could not be read is DECLARED unreadable. Omitting its block hands the model a
 *   message that never mentions a file, and it answers as though nothing had been attached —
 *   a failure to observe rendered as an observation, which is the one shape this repository
 *   refuses everywhere else.
 */
export function foldAttachmentsIntoPrompt(
  text: string,
  attachments: readonly FoldableAttachment[],
  budget: number = ATTACHMENT_PROMPT_BUDGET_CHARS,
): string {
  if (!attachments.length) return text;
  let left = Math.max(0, budget);
  const blocks: string[] = [];

  for (const a of attachments) {
    const name = cleanAttachmentName(a.name);
    if (a.text === null) {
      blocks.push(
        a.absence === 'over_limit'
          ? `--- attached file: ${name} — NOT SENT (only the first ${MAX_ATTACHMENTS_PER_MESSAGE} files on a message are read) ---`
          : `--- attached file: ${name} — COULD NOT BE READ (it expired or was removed) ---`,
      );
      continue;
    }
    if (left <= 0) {
      blocks.push(`--- attached file: ${name} — NOT INCLUDED (the attachment budget for this message was already full) ---`);
      continue;
    }
    const body = a.text.length > left ? a.text.slice(0, left) : a.text;
    left -= body.length;
    const head = `--- attached file: ${name} (${a.mime}) ---`;
    const tail =
      body.length < a.text.length
        ? `--- end of ${name} (truncated at ${body.length} of ${a.text.length} characters) ---`
        : `--- end of ${name} ---`;
    blocks.push(`${head}\n${body}\n${tail}`);
  }

  return `${text}\n\n${blocks.join('\n\n')}`;
}
