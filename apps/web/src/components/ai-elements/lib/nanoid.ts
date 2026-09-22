// Local stand-in for `nanoid`, which prompt-input.tsx uses to key attachments and referenced
// sources it holds itself.
//
// The same contract: a URL-safe random id, 21 characters by default, from the platform's
// cryptographic generator. Only the default alphabet is reproduced; `customAlphabet` is not
// imported by any vendored file.
const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

export function nanoid(size = 21): string {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  // 64 symbols, so the low six bits of a byte pick one without bias.
  for (const byte of bytes) id += ALPHABET[byte & 63];
  return id;
}
