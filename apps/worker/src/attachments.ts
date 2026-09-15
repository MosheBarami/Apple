// The attachment store: where a file a person attached to a message actually lives.
//
// WHY KV AND NOT R2. The audit's instruction for this row was to add an `r2_buckets` binding named
// ATTACHMENTS to wrangler.jsonc. That binding names a bucket nobody has created: there is no R2
// anywhere in this account's configuration, and a binding pointed at a non-existent bucket fails
// `wrangler deploy` for every other change riding in the same deploy. Provisioning storage is the
// owner's decision, so this uses the KV namespace the worker already has — the same store, and the
// same project-scoped key discipline, that generated images have used since imagegen shipped.
//
// The consequence is written down rather than hidden: an attachment is small (MAX_ATTACHMENT_BYTES)
// and it expires (ATTACHMENT_TTL_SECONDS). Both are honest properties of this store, both are
// surfaced to the reader — a fold whose bytes have aged out says so in the prompt instead of
// silently dropping the file — and both stop being necessary the day a bucket exists. When one
// does, `putAttachment`, `readAttachment` and `deleteAttachment` are the three functions to
// repoint; nothing above them knows which store answered.
import type { Env } from './env';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  cleanAttachmentName,
  decodeAttachmentText,
  foldAttachmentsIntoPrompt,
  validateAttachment,
  type AttachmentVerdict,
  type ChatAttachment,
  type FoldableAttachment,
} from '@golem/shared';

/**
 * How long an attachment stays readable: seven days.
 *
 * Longer than a generated image (an hour) because an attachment is part of what the person SAID,
 * and a conversation is re-read. Not forever, because this is a key-value namespace being asked to
 * hold user files, and unbounded accretion in it is a bill nobody chose.
 */
export const ATTACHMENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** What is stored beside the bytes. Small on purpose: KV caps metadata at 1 KiB. */
export interface AttachmentMeta {
  name: string;
  mime: string;
  size: number;
  /** The unix second KV drops these bytes, anchored at write time for the same reason images do. */
  expiresAt: number;
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The key an attachment lives under.
 *
 * SCOPED TO THE PROJECT, and that is the authorisation rather than a tidiness choice — the same
 * reasoning `imageKvKey` records. The project half comes from the authenticated path or from the
 * socket's binding; a client that hands us an id can only ever address its own project's namespace.
 */
export function attachmentKvKey(projectId: string, attachmentId: string): string {
  return `att:${projectId}:${attachmentId}`;
}

/** True for an id this store could have minted. Checked before it is concatenated into a key. */
export function isAttachmentId(id: string): boolean {
  return ID_RE.test(id);
}

/**
 * Validate and store, or refuse and store nothing.
 *
 * The verdict is reached from the BYTES, never from the headers: `declaredMime` and the name are
 * both values the uploader chose, and an allowlist checked against them is a naming convention.
 */
export async function putAttachment(
  env: Env,
  projectId: string,
  input: { name: string; declaredMime: string; bytes: Uint8Array },
): Promise<{ ok: true; attachment: ChatAttachment } | { ok: false; verdict: Extract<AttachmentVerdict, { ok: false }> }> {
  const verdict = validateAttachment({ name: input.name, declaredMime: input.declaredMime, bytes: input.bytes });
  if (!verdict.ok) return { ok: false, verdict };

  const attachmentId = crypto.randomUUID();
  const meta: AttachmentMeta = {
    name: verdict.name,
    mime: verdict.mime,
    size: verdict.size,
    expiresAt: Math.floor(Date.now() / 1000) + ATTACHMENT_TTL_SECONDS,
  };
  await env.KV.put(attachmentKvKey(projectId, attachmentId), bufferOf(input.bytes), {
    expirationTtl: ATTACHMENT_TTL_SECONDS,
    metadata: meta,
  });
  return { ok: true, attachment: { kind: verdict.kind, name: verdict.name, attachmentId, mime: verdict.mime, size: verdict.size } };
}

/** A copy of the bytes as a plain ArrayBuffer, so a view over a larger buffer cannot be stored whole. */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** The stored bytes and what was recorded about them, or null for "there is nothing there". */
export async function readAttachment(
  env: Env,
  projectId: string,
  attachmentId: string,
): Promise<{ bytes: Uint8Array; meta: AttachmentMeta } | null> {
  if (!isAttachmentId(attachmentId)) return null;
  const { value, metadata } = await env.KV.getWithMetadata<AttachmentMeta>(attachmentKvKey(projectId, attachmentId), 'arrayBuffer');
  if (!value || !metadata) return null;
  return { bytes: new Uint8Array(value), meta: metadata };
}

export async function deleteAttachment(env: Env, projectId: string, attachmentId: string): Promise<boolean> {
  if (!isAttachmentId(attachmentId)) return false;
  await env.KV.delete(attachmentKvKey(projectId, attachmentId));
  return true;
}

/**
 * THE MESSAGE THE MODEL IS ACTUALLY GIVEN.
 *
 * `ClientMsg` has carried `attachments?: ChatAttachment[]` since the protocol was written, and the
 * session Durable Object's chat ingress read `msg.text` and `msg.mode` and nothing else. This is
 * the function that closes that gap, and it lives here rather than inline in the DO so its
 * behaviour can be driven without a socket, a quota check and a model call.
 *
 * FOUR RULES, and every one of them is about not lying to somebody:
 *
 *   The frame is a REQUEST, NOT A RECORD. The name, type and size the client sends are its claims
 *   about a row the server already holds; the stored metadata wins.
 *
 *   The project comes from the caller — the socket's binding — so an id belonging to another
 *   project reads as missing rather than opening it.
 *
 *   A file whose bytes are gone is DECLARED gone. KV drops these after ATTACHMENT_TTL_SECONDS, so
 *   an old message re-run lands on that branch as a matter of course, not exotically.
 *
 *   A file past the per-message limit is NAMED as dropped. A silent truncation is how somebody
 *   spends a whole run wondering why the fifth file was ignored.
 *
 * It cannot throw on anything a socket can deliver: a TypeError inside the frame handler loses the
 * whole message, and the person sees a build that never started with no reason given.
 */
export async function promptWithAttachments(env: Env, projectId: string, text: string, attachments: unknown): Promise<string> {
  if (!Array.isArray(attachments) || attachments.length === 0) return text;

  const rows: FoldableAttachment[] = [];
  let seen = 0;
  for (const raw of attachments) {
    if (typeof raw !== 'object' || raw === null) continue;
    const claim = raw as { attachmentId?: unknown; name?: unknown };
    const id = typeof claim.attachmentId === 'string' ? claim.attachmentId : '';
    const claimedName = cleanAttachmentName(typeof claim.name === 'string' ? claim.name : 'attachment');
    seen += 1;
    if (seen > MAX_ATTACHMENTS_PER_MESSAGE) {
      rows.push({ name: claimedName, mime: 'text/plain', text: null, absence: 'over_limit' });
      continue;
    }
    const found = id ? await readAttachment(env, projectId, id) : null;
    if (!found) {
      rows.push({ name: claimedName, mime: 'text/plain', text: null });
      continue;
    }
    // Belt and braces with the upload check: a value stored before a rule changed must not be
    // decoded leniently into replacement characters on its way into a model's context.
    const body = found.bytes.byteLength > MAX_ATTACHMENT_BYTES ? null : decodeAttachmentText(found.bytes);
    rows.push({ name: found.meta.name, mime: found.meta.mime, text: body });
  }

  if (!rows.length) return text;
  return foldAttachmentsIntoPrompt(text, rows);
}
