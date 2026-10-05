// Pure helpers for the capture half of run-piece.mjs: where the four world cameras go, whether a piece is
// world, UI or both, how big a captured picture really is, and how to read a play-test console. No Studio, no
// network: tests/eval-capture-plan.test.mjs covers each.

const DEG = Math.PI / 180;
const FOV_DEG = 70; // Roblox's default vertical field of view
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const round = (n) => Math.round(n * 100) / 100;
const roundV = (v) => v.map(round);

/** A point `distance` studs from `center`, `elevationDeg` above the horizon, `azimuthDeg` around from +Z. */
export function orbit(center, distance, elevationDeg, azimuthDeg) {
  const el = elevationDeg * DEG;
  const az = azimuthDeg * DEG;
  return [
    center[0] + distance * Math.cos(el) * Math.sin(az),
    center[1] + distance * Math.sin(el),
    center[2] + distance * Math.cos(el) * Math.cos(az),
  ];
}

/** Where the player's head is above the spawn's top surface: a Roblox R15 avatar's eyes are about 4.5 studs up. */
export const EYE_HEIGHT = 4.5;
/** What the camera plan uses when nothing was built: a 40 stud square at the spawn. */
export const EMPTY_BOUNDS = { min: [-20, 0, -20], max: [20, 10, 20] };
export const DEFAULT_SPAWN = { position: [0, 0.5, 0], size: [12, 1, 12] };

/**
 * The four fixed cameras for a world piece, computed from the bounds of what was built.
 *
 * `bounds` is { min:[x,y,z], max:[x,y,z] } or null (nothing built: a 40 stud square at the spawn is used so the
 * empty Baseplate is still photographed the same way). `spawn` is { position, size } of the SpawnLocation.
 *
 *   radius R   half the bounding box's diagonal, never under 4 studs (so a coin is still framed at a sane distance)
 *   fit        the distance at which a sphere of radius R fills the 70 degree field of view
 *   overview   high and wide: 2.6 R away, 55 degrees up, 20 degrees round
 *   three-quarter  1.3 x fit away, 25 degrees up, 45 degrees round (the classic product angle)
 *   close-up   near the front of the piece: 0.9 R away (never under 10 studs), 12 degrees up, 35 degrees the other way,
 *              looking at a point 40% of the way up the box
 *   spawn-eye  the avatar's eyes (4.5 studs above the spawn's top), looking level at the piece's middle; when the
 *              piece is on top of the spawn (under 3 studs away) it looks down -Z, the way a player is facing on arrival
 */
export function cameraPlan(bounds, spawn = DEFAULT_SPAWN) {
  const b = bounds ?? EMPTY_BOUNDS;
  const center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const size = sub(b.max, b.min);
  const R = Math.max(4, Math.hypot(size[0], size[1], size[2]) / 2);
  const fit = R / Math.sin((FOV_DEG / 2) * DEG);

  const lowLook = [center[0], b.min[1] + size[1] * 0.4, center[2]];
  const top = spawn.position[1] + spawn.size[1] / 2;
  const eye = [spawn.position[0], top + EYE_HEIGHT, spawn.position[2]];
  const flat = Math.hypot(center[0] - eye[0], center[2] - eye[2]);
  const eyeLook = flat < 3 ? [eye[0], eye[1], eye[2] - 20] : [center[0], eye[1], center[2]];

  return {
    built: bounds !== null,
    bounds: { min: roundV(b.min), max: roundV(b.max) },
    center: roundV(center),
    radius: round(R),
    cameras: [
      { name: 'overview', position: roundV(orbit(center, 2.6 * R, 55, 20)), lookAt: roundV(center) },
      { name: 'three-quarter', position: roundV(orbit(center, 1.3 * fit, 25, 45)), lookAt: roundV(center) },
      { name: 'close-up', position: roundV(orbit(lowLook, Math.max(0.9 * R, 10), 12, -35)), lookAt: roundV(lowLook) },
      { name: 'spawn-eye', position: roundV(eye), lookAt: roundV(eyeLook) },
    ],
  };
}

/**
 * What a piece is, from what the measure step found: `world` (new parts in Workspace, or terrain the run edited), `ui` (a
 * new ScreenGui that holds at least one GuiObject; an empty ScreenGui is not a UI), `both`, or `none` (nothing was built).
 * Terrain counts as world: a canyon, a lake or an island is built from terrain and no part at all.
 */
export function classifyBuild(measure) {
  const hasWorld = (measure?.addedParts ?? 0) > 0 || measure?.terrain?.edited === true;
  const hasUi = (measure?.screenGuis ?? []).some((g) => g.guiObjects > 0);
  const kind = hasWorld && hasUi ? 'both' : hasWorld ? 'world' : hasUi ? 'ui' : 'none';
  return { kind, hasWorld, hasUi, emptyScreenGuis: (measure?.screenGuis ?? []).filter((g) => g.guiObjects === 0).map((g) => g.name) };
}

/** The camera names, in the order critics see them, read from the plan itself so the two cannot drift apart. */
export const WORLD_CAMERAS = cameraPlan(null).cameras.map((c) => c.name);

/**
 * The pictures a piece of this kind is supposed to have, by capture name: the four world cameras for a world piece, for a
 * piece with nothing built (the empty Baseplate is photographed the same way) and for both; `ui` for a UI piece and for
 * both. run-piece captures exactly these and the verdict asks for exactly these, so a picture that was planned and is
 * missing is known to be missing. The play frames are not here: the rubric lets a piece be scored without them.
 */
export function plannedShotNames(kind) {
  if (!['world', 'ui', 'both', 'none'].includes(kind)) return null;
  return [...(kind === 'ui' ? [] : WORLD_CAMERAS), ...(kind === 'ui' || kind === 'both' ? ['ui'] : [])];
}

/**
 * What the cameras frame, from the measure step: the box `measure` reported (the parts, the terrain the run edited, or
 * both) and where it came from; a window around the spawn when terrain was edited and the engine could not say where it
 * is; nothing when nothing was built. Returns { bounds, basis } with basis `parts`, `terrain`, `parts+terrain`,
 * `terrain-fallback` or `empty`.
 */
export function framingFor(measure) {
  const terrainBox = measure?.terrain?.extents ?? null;
  const partsBox = measure?.partBounds ?? null;
  if (measure?.bounds) return { bounds: measure.bounds, basis: terrainBox && partsBox ? 'parts+terrain' : terrainBox ? 'terrain' : 'parts' };
  if (measure?.terrain?.edited === true) return { bounds: terrainFallbackBounds(measure.spawn ?? DEFAULT_SPAWN), basis: 'terrain-fallback' };
  return { bounds: null, basis: 'empty' };
}

/**
 * The box to frame when the run edited terrain and the engine could not say where it is (no `terrain.extents`): a window
 * around the spawn, wide enough for a lake or a canyon. The manifest says it was a fallback; it is a guess, never a measurement.
 */
export function terrainFallbackBounds(spawn = DEFAULT_SPAWN) {
  const [x, y, z] = spawn.position;
  return { min: [x - 128, y - 4, z - 128], max: [x + 128, y + 44, z + 128] };
}

/** The pixel size of a PNG or JPEG buffer, or null when it is neither. Never trusts a file name. */
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * The picture inside a screen_capture answer. The server sends it as an MCP image item; a text item holding a
 * data URL, a bare base64 string, or JSON with an `image` / `data` / `base64` field is accepted too, because the
 * first live run is what settles which one Studio uses. Returns { bytes: Buffer, source } or null.
 */
export function extractImage(result) {
  if (result?.images?.length) return { bytes: Buffer.from(result.images[0].data, 'base64'), source: 'image-item' };
  const text = String(result?.text ?? '').trim();
  const fromBase64 = (b64, source) => {
    try {
      const bytes = Buffer.from(b64, 'base64');
      return imageSize(bytes) ? { bytes, source } : null;
    } catch {
      return null;
    }
  };
  const dataUrl = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(text);
  if (dataUrl) return fromBase64(dataUrl[1], 'text-data-url');
  if (result?.json && typeof result.json === 'object') {
    for (const key of ['image', 'data', 'base64', 'png']) {
      const v = result.json[key];
      if (typeof v === 'string') return fromBase64(v.replace(/^data:image\/[a-z]+;base64,/, ''), `json.${key}`);
    }
  }
  if (/^[A-Za-z0-9+/=\s]{200,}$/.test(text)) return fromBase64(text, 'text-base64');
  return null;
}

/** "1920x1080" for a size, so file names and the target comparison read the same way. */
export const sizeLabel = (s) => `${s.width}x${s.height}`;
export const UI_TARGETS = ['1920x1080', '1280x720'];

/**
 * Which of the two UI target sizes a captured picture met, and what to call the file. A picture that is not one of
 * the targets keeps its real size in its name: this never claims a resolution that was not captured.
 */
export function uiShotName(size) {
  const label = sizeLabel(size);
  return { label, file: `ui-${label}.${fileExtension(size)}`, target: UI_TARGETS.includes(label) ? label : null };
}

/** The extension that matches the bytes: a JPEG is `.jpg`, never `.png` (a viewer that trusts the name rejects the mismatch). */
export const fileExtension = (size) => (size?.format === 'jpeg' ? 'jpg' : 'png');

/**
 * Read a play-test console and count errors and warnings. The console is text with no level column, so this is
 * the heuristic the harness uses and records beside the typed LogService counts; the verdict takes the larger of
 * the two. A "Stack Begin ... Stack End" block belongs to the error line above it and is not counted again.
 */
export function classifyConsole(text) {
  const errorLines = [];
  const warningLines = [];
  let inStack = false;
  let lastWasError = false;
  const ERROR = /\berror\b|\bexception\b|attempt to (?:index|call|perform|compare|concatenate|get length|yield)|is not a valid member of|Script timeout|Requested module experienced an error|stack traceback/i;
  const WARNING = /\bwarning\b|infinite yield possible|deprecated/i;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Stack Begin\b/i.test(line)) {
      inStack = true;
      if (!lastWasError) errorLines.push(line); // a stack with no message above it is still one error
      continue;
    }
    if (inStack) {
      if (/^Stack End\b/i.test(line)) inStack = false;
      continue;
    }
    if (/^Infinite yield possible/i.test(line) || (WARNING.test(line) && !ERROR.test(line))) {
      warningLines.push(line);
      lastWasError = false;
    } else if (ERROR.test(line)) {
      errorLines.push(line);
      lastWasError = true;
    } else {
      lastWasError = false;
    }
  }
  return { errors: errorLines.length, warnings: warningLines.length, errorLines: errorLines.slice(0, 20), warningLines: warningLines.slice(0, 20) };
}

/** The text a console gained since `before` (the console only grows; a different start means it was cleared). */
export function consoleDelta(before, after) {
  const b = String(before ?? '');
  const a = String(after ?? '');
  return a.startsWith(b) ? a.slice(b.length) : a;
}

/**
 * Whether the play test is ESTABLISHED, and what is missing when it is not. "0 errors" means "the place ran and nothing
 * went wrong", so it needs evidence that the place ran and that the two places a script error shows up were read:
 *   - play started (start_stop_play answered ok) and the server datamodel answered while it ran;
 *   - the typed server LogService history was read (where the errors of a Script land);
 *   - the console text was read (it carries server and client output alike).
 * The client log is kept when it can be read and is not required: a LocalScript's errors reach the console too. The
 * picture frames are not required either: they are not an error source and the rubric scores a piece without them.
 */
export function playTestEvidence(play) {
  const missing = [];
  if (!play || typeof play !== 'object') return { established: false, missing: ['no play-test record'] };
  if (play.started !== true) missing.push(play.error ? `play did not start (${String(play.error).slice(0, 120)})` : 'play did not start');
  else {
    if (play.serverAnswered !== true) missing.push('the server did not answer while the place was playing');
    if (!play.logServer) missing.push('the server log could not be read');
    if (!play.console) missing.push('the console could not be read');
  }
  return { established: missing.length === 0, missing };
}

/**
 * The play-test error count the verdict uses: the LARGER of the console reading and the typed LogService readings, because
 * the verdict must not miss an error one source can see. Sources that failed are null.
 *
 * `errors` is null (not established) unless `playTestEvidence` holds; the one exception is an error that WAS seen: that
 * stands, because evidence that something went wrong needs no evidence that everything else was read.
 * Returns { established, missing, errors, warnings, sources }.
 */
export function playTestCounts({ console: c, logServer, logClient, started, serverAnswered, error }) {
  const typedErrors = [logServer, logClient].filter(Boolean).reduce((n, l) => n + (l.errors ?? 0), 0);
  const typedWarnings = [logServer, logClient].filter(Boolean).reduce((n, l) => n + (l.warnings ?? 0), 0);
  const typed = Boolean(logServer || logClient);
  const seen = Math.max(typed ? typedErrors : 0, c ? c.errors : 0);
  const evidence = playTestEvidence({ started, serverAnswered, logServer, console: c, error });
  return {
    established: evidence.established,
    missing: evidence.missing,
    errors: seen > 0 ? seen : evidence.established ? 0 : null,
    warnings: typed || c ? Math.max(typed ? typedWarnings : 0, c ? c.warnings : 0) : null,
    sources: { console: c ? { errors: c.errors, warnings: c.warnings } : null, logServer: logServer ?? null, logClient: logClient ?? null },
  };
}
