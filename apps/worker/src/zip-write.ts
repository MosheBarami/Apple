// A ZIP, written. The other half of unzip.ts, and written the same way and for the same reasons.
//
// WHY IT EXISTS. The workspace could be downloaded one file per request, so a project with thirty
// notes in it was thirty clicks and there was no way to keep a copy of the whole thing.
//
// WHY IT IS HAND-WRITTEN. unzip.ts's header records what a dependency costs in this runtime —
// resvg's WebAssembly renderer added 2.4 MB to every cold start and was taken back out — and a
// stored ZIP is a documented fixed-layout structure. This is about a hundred lines and no bundle.
//
// WHY STORED (method 0) AND NOT DEFLATE. `CompressionStream('deflate-raw')` exists in Workers, but
// every entry's compressed SIZE and CRC must be known before that entry's local header is written,
// and a streaming deflate does not know either until it has finished — which is why real streaming
// writers emit a data descriptor after the data and set the header sizes to zero. unzip.ts refuses
// to read local-header sizes for exactly that reason, and a workspace file is at most 48 KB of text
// that the browser will decompress over a gzipped HTTP response anyway. Stored is honest, readable
// by every implementation, and needs no descriptor.
//
// WHAT IT DELIBERATELY DOES NOT DO. No ZIP64 — so it refuses rather than writes an archive over
// 4 GB or past 65,535 entries, because a reader (this repo's included) would parse the truncated
// fields as real ones and produce offsets into the middle of a file. No directory entries: a folder
// in a ZIP is a prefix on a name, which is exactly what it is in the store this reads from.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of the bytes, as the ZIP format defines it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipInput {
  /** The path inside the archive. Forward slashes; a folder is a prefix, never its own entry. */
  name: string;
  bytes: Uint8Array;
}

const MAX_ENTRIES = 65_535;
const MAX_TOTAL = 0xffffffff;

/**
 * DOS date and time, which is what a ZIP stores.
 *
 * Seconds have a resolution of two and the year starts at 1980, so a date before that cannot be
 * represented and is clamped rather than wrapped — a negative year field reads as some time in
 * 2107 to every unarchiver, and a file dated in the future is a support question nobody can answer.
 */
function dosStamp(at: Date): { date: number; time: number } {
  const year = Math.max(1980, at.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
  };
}

function bytesOfName(name: string): Uint8Array {
  return new TextEncoder().encode(name);
}

/**
 * The archive, as a stream.
 *
 * One entry is held at a time — its bytes come from `read`, are written, and are dropped — plus the
 * central directory, which is 46 bytes and a name per file. So memory is bounded by the largest
 * single file rather than by the size of the archive, which is the property that lets this run in a
 * Worker over a workspace of any shape.
 *
 * `read` returning null SKIPS the entry rather than aborting or writing an empty file: the listing
 * and the store are read at different moments, and a file deleted in between is not a reason to
 * fail a download of the other twenty-nine. The entry is simply not in the directory — an empty
 * file with a real name is the outcome that would be a lie.
 */
export function zipStoredStream(
  names: readonly string[],
  read: (name: string) => Promise<Uint8Array | null>,
  now: Date = new Date(),
): ReadableStream<Uint8Array> {
  if (names.length > MAX_ENTRIES) throw new Error(`a ZIP written here holds at most ${MAX_ENTRIES} entries`);
  const { date, time } = dosStamp(now);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const directory: Uint8Array[] = [];
      let offset = 0;
      let count = 0;

      for (const name of names) {
        const bytes = await read(name);
        if (!bytes) continue;
        const nameBytes = bytesOfName(name);
        const sum = crc32(bytes);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true); // version needed: 2.0, which is what stored-with-no-descriptor is
        local.setUint16(6, 0x0800, true); // UTF-8 names. Without this flag a non-ASCII path is read as CP437.
        local.setUint16(8, 0, true); // stored
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, sum, true);
        local.setUint32(18, bytes.byteLength, true);
        local.setUint32(22, bytes.byteLength, true);
        local.setUint16(26, nameBytes.byteLength, true);
        local.setUint16(28, 0, true); // no extra field
        controller.enqueue(new Uint8Array(local.buffer));
        controller.enqueue(nameBytes);
        controller.enqueue(bytes);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 20, true); // version made by
        central.setUint16(6, 20, true); // version needed
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 0, true);
        central.setUint16(12, time, true);
        central.setUint16(14, date, true);
        central.setUint32(16, sum, true);
        central.setUint32(20, bytes.byteLength, true);
        central.setUint32(24, bytes.byteLength, true);
        central.setUint16(28, nameBytes.byteLength, true);
        central.setUint16(30, 0, true); // extra
        central.setUint16(32, 0, true); // comment
        central.setUint16(34, 0, true); // disk number
        central.setUint16(36, 0, true); // internal attributes
        central.setUint32(38, 0, true); // external attributes
        central.setUint32(42, offset, true);
        directory.push(new Uint8Array(central.buffer), nameBytes);

        offset += 30 + nameBytes.byteLength + bytes.byteLength;
        count += 1;
        if (offset > MAX_TOTAL) {
          // Refused BY NAME rather than written with wrapped offsets, which is unzip.ts's rule for
          // the same limit in the other direction. A 4 GB workspace cannot happen — every file is
          // capped at 48 KB — so this is the assertion that says so rather than a case to handle.
          controller.error(new Error('the archive is past the 4 GB a non-ZIP64 archive can address'));
          return;
        }
      }

      let directoryBytes = 0;
      for (const part of directory) {
        controller.enqueue(part);
        directoryBytes += part.byteLength;
      }

      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(4, 0, true); // this disk
      end.setUint16(6, 0, true); // disk with the directory
      end.setUint16(8, count, true);
      end.setUint16(10, count, true);
      end.setUint32(12, directoryBytes, true);
      end.setUint32(16, offset, true);
      end.setUint16(20, 0, true); // no comment
      controller.enqueue(new Uint8Array(end.buffer));
      controller.close();
    },
  });
}
