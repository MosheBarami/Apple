// DISPLAY-SIZED COPIES OF GENERATED IMAGES — Cloudflare Images binding (D-VISION-1).
//
// A generated image is a 1024px PNG of one to two megabytes, and the chat shows it as a card a few
// hundred pixels wide. On a school laptop or a phone on mobile data that is seconds of blank card
// per picture. The route that serves it now accepts `?w=`, and with the `IMAGES` binding it answers
// with a WebP scaled to that width; downloads still ask without `?w=` and get the original bytes.
//
// THE WIDTH IS SNAPPED, NOT TAKEN. Images bills by UNIQUE transformation (5,000 a month free), and
// a free-form width lets any client mint a new one per pixel. Three sizes cover every place the web
// app draws a picture.
//
// NEVER WORSE THAN BEFORE. No binding, an unreadable width, or a transform that fails — each
// returns null and the caller serves the original, exactly as it did before this file existed.

export const DISPLAY_WIDTHS = [320, 640, 1024] as const;

/** The allowed width at or above the one asked for; null when none was asked or it is not a number. */
export function displayWidth(asked: unknown): number | null {
  if (asked === undefined || asked === null || asked === '') return null;
  const n = Number(asked);
  if (!Number.isFinite(n) || n <= 0) return null;
  return DISPLAY_WIDTHS.find((w) => w >= n) ?? 1024;
}

export async function resizeForDisplay(
  env: { IMAGES?: ImagesBinding },
  bytes: Uint8Array,
  width: number,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!env.IMAGES) return null;
  try {
    const input = new Response(bytes).body;
    if (!input) return null;
    const result = await env.IMAGES.input(input)
      // scale-down: a picture already narrower than the card is never blown up.
      .transform({ width, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 82 });
    const out = new Uint8Array(await result.response().arrayBuffer());
    // A "smaller" copy that is not smaller is not worth the format change.
    if (out.byteLength === 0 || out.byteLength >= bytes.byteLength) return null;
    return { bytes: out, contentType: result.contentType() };
  } catch {
    return null;
  }
}
