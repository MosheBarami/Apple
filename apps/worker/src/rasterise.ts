// SVG to PNG, because Roblox does not take vectors and 352,761 library rows are vectors.
//
// WHY THIS IS IN THE WORKER AT ALL. Roblox's Open Cloud accepts .png, .jpeg, .bmp and .tga. The
// two icon sources — Iconify (348,522) and game-icons (4,239) — publish SVG, which is 78% of the
// library. Without a rasteriser those rows are a catalogue that can never become anything, and a
// catalogue entry that can never be used is a search result that wastes somebody's time.
//
// WHY IT COSTS WHAT IT COSTS, STATED RATHER THAN HIDDEN. resvg's WebAssembly build is 2.4 MB, and
// a Worker loads its WASM at isolate start whether or not a request uses it. Measured: the bundle
// goes from 1,691 KiB (471 KiB gzipped) to roughly four megabytes. That is well inside the limit
// and it is not free — every cold start pays for it, so it earns its place only because it unlocks
// three quarters of the library, and if the icon sources are ever dropped this module should go
// with them.
//
// INITIALISED ONCE PER ISOLATE. `initWasm` throws if called twice, and a Worker isolate serves
// many requests, so the promise is memoised rather than the boolean — two concurrent first
// requests would otherwise both see "not yet initialised" and the second would throw.
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  // The MEMOISED PROMISE, not a boolean. `let done = false; if (!done) { await initWasm(); done =
  // true; }` looks equivalent and is not: two requests arriving together both read false, both
  // call initWasm, and the second throws "Already initialized". The promise makes the second
  // caller wait for the first one's work instead of repeating it.
  ready ??= initWasm(wasm as WebAssembly.Module);
  return ready;
}

export interface RasteriseOptions {
  /** Square edge in pixels. Roblox caps textures at 1024 and icons never need that much. */
  size?: number;
  /**
   * Fill for any `currentColor` in the source.
   *
   * Iconify ships monochrome icons whose paths inherit `currentColor`, which resolves to BLACK
   * when nothing sets it — a black icon on a transparent background, invisible on the dark UI most
   * Roblox games use. White is the default here because an icon that cannot be seen is a failure
   * that renders as a success.
   */
  colour?: string;
}

export const MAX_RASTER_PX = 1024;
export const DEFAULT_RASTER_PX = 256;

export interface RasteriseResult {
  ok: boolean;
  png?: ArrayBuffer;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Rasterise one SVG. Returns a result rather than throwing, because every caller is inside a loop
 * over library rows and one unrenderable icon must not end the batch.
 */
export async function rasteriseSvg(svg: string, opts: RasteriseOptions = {}): Promise<RasteriseResult> {
  const size = Math.max(16, Math.min(opts.size ?? DEFAULT_RASTER_PX, MAX_RASTER_PX));
  const text = typeof svg === 'string' ? svg.trim() : '';
  if (!text.startsWith('<')) return { ok: false, error: 'that is not SVG — it does not start with a tag' };
  // A cheap shape check before a megabyte of WASM gets involved. An HTML error page served with a
  // 200 is the realistic bad input here, and it starts with `<` too.
  if (!/<svg[\s>]/i.test(text)) return { ok: false, error: 'no <svg> element in the document' };

  try {
    await init();
    const resvg = new Resvg(withColour(text, opts.colour ?? '#ffffff'), {
      fitTo: { mode: 'width', value: size },
      // Transparent, so an icon composites onto whatever surface a game puts it on. A white
      // background would look correct in the Studio preview and wrong everywhere else.
      background: 'rgba(0,0,0,0)',
    });
    const rendered = resvg.render();
    const png = rendered.asPng();
    const out = { ok: true, png: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer, width: rendered.width, height: rendered.height };
    rendered.free();
    resvg.free();
    return out;
  } catch (e) {
    return { ok: false, error: `could not render: ${String((e as Error)?.message ?? e).slice(0, 160)}` };
  }
}

/**
 * Resolve `currentColor` before resvg sees it.
 *
 * resvg has no CSS cascade to inherit from, so `fill="currentColor"` renders as black. Substituting
 * the literal is cruder than a real cascade and it is exactly as correct for the input this is
 * given: Iconify's whole-set JSON stores bare path data with no styling of its own.
 */
export function withColour(svg: string, colour: string): string {
  const safe = /^#[0-9a-f]{3,8}$/i.test(colour) ? colour : '#ffffff';
  return svg.replace(/currentColor/g, safe);
}

/**
 * The SVG for one Iconify icon, built from the set's own record.
 *
 * Iconify's bulk JSON carries `body` — the path fragment — and the SET's width and height, not the
 * icon's. Wrapping it needs both, and using a default viewBox instead would silently crop or
 * letterbox every icon in any set that is not 24x24 (game-icons is 512x512).
 */
export function iconifySvg(body: string, width = 24, height = 24): string {
  const w = Number.isFinite(width) && width > 0 ? width : 24;
  const h = Number.isFinite(height) && height > 0 ? height : 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
