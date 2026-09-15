// One file out of a ZIP, using only what the runtime already has.
//
// WHY THIS EXISTS. Three sources publish ZIP archives and nothing else: ambientCG (4,900 PBR
// materials, zip-only by its own API — `downloadFiletypeCategories` lists exactly one entry and it
// is `zip`), OpenGameArt and Kenney. Roblox takes png, jpeg, bmp and tga, so without a reader
// those rows are catalogue entries that can never become anything.
//
// WHY IT IS HAND-WRITTEN AND NOT A DEPENDENCY. `DecompressionStream('deflate-raw')` is built into
// Workers, and a ZIP's central directory is a documented fixed-layout structure. That makes this
// about a hundred lines and ZERO bundle cost — which matters here because the alternative was
// measured: resvg's WebAssembly renderer added 2.4 MB to every cold start and broke 33 test files,
// and it was taken back out for exactly that reason.
//
// WHAT IT DELIBERATELY DOES NOT DO. It reads the central directory, not the local headers. The
// local header's sizes are allowed to be zero with the real values in a trailing data descriptor,
// so a reader that trusted them would silently produce empty files for any archive written by a
// streaming writer — the exact shape of bug that ends with an "uploaded" asset containing nothing.
//
// ZIP64 and encrypted entries are refused BY NAME rather than mis-parsed. An archive over 4 GB or
// one with more than 65,535 entries is not something this is given, and guessing at one would
// produce an offset into the middle of a file.

/** Little-endian readers. The format is fixed-layout and every field below is documented by offset. */
const u16 = (v: DataView, at: number) => v.getUint16(at, true);
const u32 = (v: DataView, at: number) => v.getUint32(at, true);

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** The two methods a real archive uses. Anything else is refused rather than guessed at. */
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  /** Offset of the LOCAL header, from the central directory — never from a guess. */
  localOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  encrypted: boolean;
}

export interface ZipListing {
  ok: boolean;
  entries?: ZipEntry[];
  error?: string;
}

/**
 * List what an archive contains, from its central directory.
 *
 * The End of Central Directory record sits at the end and is variable-length because of its
 * comment field, so it is found by scanning BACKWARDS for the signature — bounded to the last
 * 64 KiB plus the record itself, which is the maximum a comment can make it.
 */
export function listZip(bytes: ArrayBuffer): ZipListing {
  const view = new DataView(bytes);
  if (bytes.byteLength < 22) return { ok: false, error: 'too short to be a zip' };

  const scanFrom = Math.max(0, bytes.byteLength - (0xffff + 22));
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= scanFrom; i--) {
    if (u32(view, i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, error: 'no end-of-central-directory record — this is not a zip' };

  // ZIP64 is named rather than mis-parsed. Its locator sits immediately before the EOCD, and the
  // 32-bit fields below are sentinels when it is present, so reading them would give an offset
  // into the middle of a file.
  if (eocd >= 20 && u32(view, eocd - 20) === SIG_EOCD64_LOCATOR) {
    return { ok: false, error: 'zip64 archive — this reader handles the 32-bit format only' };
  }

  const count = u16(view, eocd + 10);
  const dirSize = u32(view, eocd + 12);
  const dirOffset = u32(view, eocd + 16);
  if (dirOffset + dirSize > bytes.byteLength) return { ok: false, error: 'the central directory runs past the end of the file' };

  const entries: ZipEntry[] = [];
  let at = dirOffset;
  const name = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.byteLength || u32(view, at) !== SIG_CENTRAL) {
      return { ok: false, error: `central directory entry ${i} is malformed` };
    }
    const flags = u16(view, at + 8);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    entries.push({
      name: name.decode(new Uint8Array(bytes, at + 46, nameLen)),
      method: u16(view, at + 10),
      compressedSize: u32(view, at + 20),
      uncompressedSize: u32(view, at + 24),
      localOffset: u32(view, at + 42),
      // Bit 0 of the general-purpose flags. An encrypted entry inflates to noise, so it is
      // reported rather than handed back as bytes.
      encrypted: (flags & 0x1) !== 0,
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}

export interface ExtractResult {
  ok: boolean;
  name?: string;
  bytes?: ArrayBuffer;
  error?: string;
}

/**
 * Extract ONE entry, chosen by a predicate over the listing.
 *
 * A predicate rather than a name because the caller knows what it wants ("the base-colour map at
 * 1K") and the archive decides what it is called. Returning the whole archive's contents to let a
 * caller pick would mean inflating every file in it — an ambientCG material is six maps and only
 * one of them is ever used.
 */
export async function extractFromZip(
  bytes: ArrayBuffer,
  pick: (entries: ZipEntry[]) => ZipEntry | undefined,
): Promise<ExtractResult> {
  const listing = listZip(bytes);
  if (!listing.ok || !listing.entries) return { ok: false, error: listing.error };

  const entry = pick(listing.entries);
  if (!entry) {
    // The names are in the message on purpose: "nothing matched" in an archive of six files is a
    // question about the predicate, and the answer is the list.
    const names = listing.entries.map((e) => e.name).slice(0, 12).join(', ');
    return { ok: false, error: `no entry matched. The archive holds: ${names}` };
  }
  if (entry.encrypted) return { ok: false, error: `"${entry.name}" is encrypted` };
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE) {
    return { ok: false, error: `"${entry.name}" uses compression method ${entry.method}, which this reader does not implement` };
  }

  const view = new DataView(bytes);
  if (entry.localOffset + 30 > bytes.byteLength || u32(view, entry.localOffset) !== SIG_LOCAL) {
    return { ok: false, error: `"${entry.name}" has no local header where the directory says it is` };
  }
  // The local header's own name and extra lengths are the only fields read from it — they are what
  // locate the data, and unlike the sizes they cannot be deferred to a data descriptor.
  const dataAt = entry.localOffset + 30 + u16(view, entry.localOffset + 26) + u16(view, entry.localOffset + 28);
  if (dataAt + entry.compressedSize > bytes.byteLength) {
    return { ok: false, error: `"${entry.name}" runs past the end of the archive` };
  }
  const raw = bytes.slice(dataAt, dataAt + entry.compressedSize);

  if (entry.method === METHOD_STORED) return { ok: true, name: entry.name, bytes: raw };

  try {
    // `deflate-raw`, not `deflate`: a zip entry carries a bare deflate stream with no zlib header,
    // and asking for `deflate` fails on the very first byte.
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const out = await new Response(stream).arrayBuffer();
    if (entry.uncompressedSize && out.byteLength !== entry.uncompressedSize) {
      // The directory says how big this should be. A short read means a truncated download, and an
      // image that is 90% there is still a broken upload — it must not pass as a success.
      return { ok: false, error: `"${entry.name}" inflated to ${out.byteLength} bytes, the directory says ${entry.uncompressedSize}` };
    }
    return { ok: true, name: entry.name, bytes: out };
  } catch (e) {
    return { ok: false, error: `could not inflate "${entry.name}": ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}

/**
 * Choose the base-colour image from a PBR material archive.
 *
 * ORDER MATTERS AND IS THE POINT. A material ships six maps and five of them are wrong: a normal
 * map is a lilac surface, a roughness map is grey, an ambient-occlusion map is nearly white. All
 * six are images and all six would upload successfully — so a predicate that took the first image
 * it found would produce a library of plausible-looking, uniformly wrong textures. The colour map
 * is asked for by every name the sources use, and the fallback refuses rather than settling.
 */
export function pickBaseColour(entries: ZipEntry[]): ZipEntry | undefined {
  const images = entries.filter((e) => /\.(png|jpe?g)$/i.test(e.name) && !e.name.startsWith('__MACOSX'));
  const byPreference = [
    /(_|\b)(basecolor|base_color)\b/i,
    /(_|\b)color\b/i,
    /(_|\b)diffuse\b/i,
    /(_|\b)albedo\b/i,
    /(_|\b)col\b/i,
  ];
  for (const re of byPreference) {
    const hit = images.find((e) => re.test(e.name));
    if (hit) return hit;
  }
  // Deliberately NOT `images[0]`. An archive with no colour map is one this caller cannot use, and
  // a normal map uploaded as a texture is a wrong answer that looks like a right one.
  return undefined;
}
