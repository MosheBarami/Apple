/**
 * Golem generative UI — runtime validator.
 *
 * Security model
 * --------------
 * The agent is *untrusted input*. This module is the only door between what it
 * emits and what the app renders, and it is a whitelist, not a filter:
 *
 *  1. A document is rebuilt key-by-key from a fixed allowlist. Nothing the agent
 *     wrote is ever forwarded by reference, so `style`, `className`, `onClick`,
 *     `dangerouslySetInnerHTML` and friends cannot survive into React props —
 *     they are not copied at all. In strict mode their presence also fails the
 *     document outright.
 *  2. Every "styling" value is an enum member, resolved to CSS by the renderer.
 *     There is no path by which arbitrary CSS or a colour literal reaches the DOM.
 *  3. Links accept `https:`, in-app absolute paths and fragments only. `javascript:`,
 *     `data:`, `vbscript:`, `blob:`, `file:` and protocol-relative `//host` are refused.
 *  4. Images accept a base64 data URL of a raster type only (png/jpeg/webp). SVG is
 *     refused because an SVG data URL can carry script.
 *  5. Size, count, string length and structural depth are all bounded before any
 *     schema work happens, so a hostile payload cannot be used to hang the tab.
 *
 * Failure is total: an invalid document renders a safe fallback. There is no
 * partial application, because a half-applied UI is exactly how injection wins.
 *
 * This file is plain TypeScript with no imports beyond the schema's types and
 * constants, so `node --test` can load it directly via native type stripping.
 */

import {
  ASSET_KINDS,
  BLOCK_TYPES,
  CASE_STATUSES,
  CHANGE_KINDS,
  CODE_LANGUAGES,
  CRITIQUE_DIMENSIONS,
  DIFF_LINE_KINDS,
  GENERATIVE_UI_VERSION,
  HEADING_LEVELS,
  LIMITS,
  PLANS,
  SEVERITIES,
  STEP_STATUSES,
  TONES,
  VIEW_NAMES,
} from './schema.ts';
import type {
  AssetItem,
  Block,
  BlockType,
  ChangeEntry,
  CheckpointRef,
  CritiqueDefect,
  DiffHunk,
  DiffLine,
  ExcerptLine,
  FixSuggestion,
  ImageRef,
  KeyValue,
  LinkRef,
  PlanStep,
  PropertyGroup,
  PropertyRow,
  RenderViewEntry,
  SceneRef,
  SeriesPoint,
  TestCase,
  Tone,
  UIDocument,
} from './schema.ts';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ValidationOk {
  ok: true;
  doc: UIDocument;
  /** Dropped-but-tolerated problems (only produced when strictUnknownProps is false). */
  warnings: string[];
}

export interface ValidationFail {
  ok: false;
  errors: string[];
  warnings: string[];
}

export type ValidationResult = ValidationOk | ValidationFail;

export interface ValidateOptions {
  /**
   * true (default): an unrecognised property anywhere fails the whole document.
   * false: the property is dropped, a warning is recorded, and the rest is kept.
   * Either way the property never reaches a React component.
   */
  strictUnknownProps?: boolean;
  /** Override the top-level block cap (never raised above LIMITS.maxBlocks). */
  maxBlocks?: number;
}

// ---------------------------------------------------------------------------
// Low-level guards
// ---------------------------------------------------------------------------

const HTTPS_HOST = /^https:\/\/[^\s/?#]+[^\s]*$/i;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only https:, same-origin absolute paths (`/x`, never `//host`) and `#fragment`. */
export function isSafeHref(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  if (value.length === 0 || value.length > LIMITS.maxLabelLength) return false;
  // Control characters and whitespace are how `java\tscript:` style bypasses are built.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return false;
  }
  if (value.startsWith('#')) return !value.includes('//');
  if (value.startsWith('//')) return false; // protocol-relative → attacker-chosen origin
  if (value.startsWith('/')) return true; // in-app route
  return HTTPS_HOST.test(value);
}

/** Only a base64 data URL of a raster image. SVG and remote URLs are refused. */
export function isSafeImageSrc(src: unknown): boolean {
  if (typeof src !== 'string') return false;
  if (src.length > LIMITS.maxImageDataLength) return false;
  return IMAGE_DATA_URL.test(src);
}

/** Structural nesting depth of arbitrary JSON, used as a cheap bomb guard. */
export function structuralDepth(value: unknown, seen: Set<object> = new Set()): number {
  if (value === null || typeof value !== 'object') return 0;
  if (seen.has(value as object)) return Number.POSITIVE_INFINITY; // cycle
  seen.add(value as object);
  let deepest = 0;
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of values) {
    const d = structuralDepth(child, seen);
    if (d > deepest) deepest = d;
    if (deepest === Number.POSITIVE_INFINITY) break;
  }
  seen.delete(value as object);
  return deepest + 1;
}

/** Serialised size in bytes, or Infinity when the value will not serialise. */
export function documentByteLength(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string') return Number.POSITIVE_INFINITY;
    // TextEncoder exists in browsers and Node; fall back to a UTF-16 estimate.
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length * 2;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// ---------------------------------------------------------------------------
// Field readers. Each records an error and returns undefined on a mismatch.
// ---------------------------------------------------------------------------

interface Ctx {
  errors: string[];
  warnings: string[];
  strict: boolean;
}

function fail(ctx: Ctx, path: string, message: string): undefined {
  if (ctx.errors.length < 40) ctx.errors.push(`${path}: ${message}`);
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Refuse anything outside the allowlist. Prototype-pollution keys are always an
 * error, even in lenient mode, because they are never a benign mistake.
 */
function checkKeys(raw: Record<string, unknown>, allowed: readonly string[], ctx: Ctx, path: string): void {
  for (const key of Object.keys(raw)) {
    if (allowed.includes(key)) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      fail(ctx, `${path}.${key}`, 'forbidden property name');
      continue;
    }
    if (ctx.strict) fail(ctx, `${path}.${key}`, 'unknown property');
    else ctx.warnings.push(`${path}.${key}: unknown property dropped`);
  }
}

function readString(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  opts: { required?: boolean; max?: number; allowEmpty?: boolean } = {},
): string | undefined {
  const v = raw[key];
  const max = opts.max ?? LIMITS.maxStringLength;
  if (v === undefined || v === null) {
    if (opts.required) fail(ctx, `${path}.${key}`, 'required string is missing');
    return undefined;
  }
  if (typeof v !== 'string') return fail(ctx, `${path}.${key}`, `expected string, got ${typeName(v)}`);
  if (v.length > max) return fail(ctx, `${path}.${key}`, `string exceeds ${max} characters`);
  if (!opts.allowEmpty && opts.required && v.trim().length === 0) {
    return fail(ctx, `${path}.${key}`, 'required string is empty');
  }
  return v;
}

function readNumber(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  const v = raw[key];
  if (v === undefined || v === null) {
    if (opts.required) fail(ctx, `${path}.${key}`, 'required number is missing');
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return fail(ctx, `${path}.${key}`, `expected a finite number, got ${typeName(v)}`);
  }
  if (opts.integer && !Number.isInteger(v)) return fail(ctx, `${path}.${key}`, 'expected an integer');
  if (opts.min !== undefined && v < opts.min) return fail(ctx, `${path}.${key}`, `must be >= ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) return fail(ctx, `${path}.${key}`, `must be <= ${opts.max}`);
  return v;
}

/** `number | null` — the critique score is legitimately null when unavailable. */
function readNullableNumber(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  opts: { min?: number; max?: number } = {},
): number | null | undefined {
  if (raw[key] === null) return null;
  return readNumber(raw, key, ctx, path, opts);
}

function readBoolean(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  opts: { required?: boolean } = {},
): boolean | undefined {
  const v = raw[key];
  if (v === undefined || v === null) {
    if (opts.required) fail(ctx, `${path}.${key}`, 'required boolean is missing');
    return undefined;
  }
  if (typeof v !== 'boolean') return fail(ctx, `${path}.${key}`, `expected boolean, got ${typeName(v)}`);
  return v;
}

function readEnum<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  values: readonly T[],
  ctx: Ctx,
  path: string,
  opts: { required?: boolean } = {},
): T | undefined {
  const v = raw[key];
  if (v === undefined || v === null) {
    if (opts.required) fail(ctx, `${path}.${key}`, `required value is missing (one of ${values.join(', ')})`);
    return undefined;
  }
  if (typeof v !== 'string' || !values.includes(v as T)) {
    return fail(ctx, `${path}.${key}`, `not an allowed token — expected one of ${values.join(', ')}`);
  }
  return v as T;
}

function readNumberEnum<T extends number>(
  raw: Record<string, unknown>,
  key: string,
  values: readonly T[],
  ctx: Ctx,
  path: string,
): T | undefined {
  const v = raw[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !values.includes(v as T)) {
    return fail(ctx, `${path}.${key}`, `not an allowed value — expected one of ${values.join(', ')}`);
  }
  return v as T;
}

function readArray<T>(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  item: (value: unknown, ctx: Ctx, path: string) => T | undefined,
  opts: { required?: boolean; max?: number; min?: number } = {},
): T[] | undefined {
  const v = raw[key];
  const max = Math.min(opts.max ?? LIMITS.maxArrayItems, LIMITS.maxArrayItems);
  if (v === undefined || v === null) {
    if (opts.required) fail(ctx, `${path}.${key}`, 'required array is missing');
    return undefined;
  }
  if (!Array.isArray(v)) return fail(ctx, `${path}.${key}`, `expected array, got ${typeName(v)}`);
  if (v.length > max) return fail(ctx, `${path}.${key}`, `array has ${v.length} items, limit is ${max}`);
  if (opts.min !== undefined && v.length < opts.min) {
    return fail(ctx, `${path}.${key}`, `array needs at least ${opts.min} item(s)`);
  }
  const out: T[] = [];
  for (let i = 0; i < v.length; i++) {
    const parsed = item(v[i], ctx, `${path}.${key}[${i}]`);
    if (parsed === undefined) return undefined;
    out.push(parsed);
  }
  return out;
}

function readStringArray(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  opts: { required?: boolean; max?: number; maxLength?: number } = {},
): string[] | undefined {
  return readArray<string>(
    raw,
    key,
    ctx,
    path,
    (value, c, p) => {
      if (typeof value !== 'string') return fail(c, p, `expected string, got ${typeName(value)}`);
      if (value.length > (opts.maxLength ?? LIMITS.maxStringLength)) return fail(c, p, 'string too long');
      return value;
    },
    opts,
  );
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** Strip undefined keys so the rebuilt object matches the interface exactly. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

// ---------------------------------------------------------------------------
// Value-object readers
// ---------------------------------------------------------------------------

function object(value: unknown, ctx: Ctx, path: string): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) return fail(ctx, path, `expected an object, got ${typeName(value)}`);
  return value;
}

function readImage(value: unknown, ctx: Ctx, path: string): ImageRef | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['src', 'alt', 'width', 'height'], ctx, path);
  const src = readString(raw, 'src', ctx, path, { required: true, max: LIMITS.maxImageDataLength });
  if (src === undefined) return undefined;
  if (!isSafeImageSrc(src)) {
    return fail(ctx, `${path}.src`, 'image must be a base64 data URL of a png, jpeg or webp');
  }
  const alt = readString(raw, 'alt', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  if (alt === undefined) return undefined;
  const width = readNumber(raw, 'width', ctx, path, { min: 1, max: 8192, integer: true });
  const height = readNumber(raw, 'height', ctx, path, { min: 1, max: 8192, integer: true });
  if (ctx.errors.length) return undefined;
  return compact({ src, alt, width, height }) as ImageRef;
}

function readImageField(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
): ImageRef | undefined {
  if (raw[key] === undefined || raw[key] === null) return undefined;
  return readImage(raw[key], ctx, `${path}.${key}`);
}

function readLinkField(raw: Record<string, unknown>, key: string, ctx: Ctx, path: string): LinkRef | undefined {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  const obj = object(value, ctx, `${path}.${key}`);
  if (!obj) return undefined;
  const p = `${path}.${key}`;
  checkKeys(obj, ['href', 'label'], ctx, p);
  const href = readString(obj, 'href', ctx, p, { required: true, max: LIMITS.maxLabelLength });
  const label = readString(obj, 'label', ctx, p, { required: true, max: LIMITS.maxLabelLength });
  if (href === undefined || label === undefined) return undefined;
  if (!isSafeHref(href)) {
    return fail(ctx, `${p}.href`, 'unsafe URL — only https:, in-app paths and #fragments are allowed');
  }
  return { href, label };
}

function readKeyValue(value: unknown, ctx: Ctx, path: string): KeyValue | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['key', 'value', 'tone'], ctx, path);
  const key = readString(raw, 'key', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const val = readString(raw, 'value', ctx, path, { required: true, max: LIMITS.maxLabelLength, allowEmpty: true });
  const tone = readEnum<Tone>(raw, 'tone', TONES, ctx, path);
  if (key === undefined || val === undefined) return undefined;
  return compact({ key, value: val, tone }) as KeyValue;
}

function readKeyValuesField(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
  opts: { required?: boolean } = {},
): KeyValue[] | undefined {
  return readArray<KeyValue>(raw, key, ctx, path, readKeyValue, opts);
}

function readSceneRefField(raw: Record<string, unknown>, key: string, ctx: Ctx, path: string): SceneRef | undefined {
  const obj = object(raw[key], ctx, `${path}.${key}`);
  if (!obj) return undefined;
  const p = `${path}.${key}`;
  checkKeys(obj, ['label', 'image', 'stats'], ctx, p);
  const label = readString(obj, 'label', ctx, p, { required: true, max: LIMITS.maxLabelLength });
  if (label === undefined) return undefined;
  const image = readImageField(obj, 'image', ctx, p);
  const stats = readKeyValuesField(obj, 'stats', ctx, p);
  if (ctx.errors.length) return undefined;
  return compact({ label, image, stats }) as SceneRef;
}

function readCheckpointRefField(
  raw: Record<string, unknown>,
  key: string,
  ctx: Ctx,
  path: string,
): CheckpointRef | undefined {
  const obj = object(raw[key], ctx, `${path}.${key}`);
  if (!obj) return undefined;
  const p = `${path}.${key}`;
  checkKeys(obj, ['label', 'when', 'scriptCount', 'instanceCount', 'sizeBytes'], ctx, p);
  const label = readString(obj, 'label', ctx, p, { required: true, max: LIMITS.maxLabelLength });
  if (label === undefined) return undefined;
  const when = readString(obj, 'when', ctx, p, { max: LIMITS.maxLabelLength });
  const scriptCount = readNumber(obj, 'scriptCount', ctx, p, { min: 0, integer: true });
  const instanceCount = readNumber(obj, 'instanceCount', ctx, p, { min: 0, integer: true });
  const sizeBytes = readNumber(obj, 'sizeBytes', ctx, p, { min: 0 });
  if (ctx.errors.length) return undefined;
  return compact({ label, when, scriptCount, instanceCount, sizeBytes }) as CheckpointRef;
}

function readDiffLine(value: unknown, ctx: Ctx, path: string): DiffLine | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['kind', 'text', 'n'], ctx, path);
  const kind = readEnum(raw, 'kind', DIFF_LINE_KINDS, ctx, path, { required: true });
  const text = readString(raw, 'text', ctx, path, { required: true, allowEmpty: true, max: 2000 });
  const n = readNumber(raw, 'n', ctx, path, { min: 0, integer: true });
  if (kind === undefined || text === undefined) return undefined;
  return compact({ kind, text, n }) as DiffLine;
}

function readDiffHunk(value: unknown, ctx: Ctx, path: string): DiffHunk | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['header', 'lines'], ctx, path);
  const header = readString(raw, 'header', ctx, path, { max: LIMITS.maxLabelLength });
  const lines = readArray<DiffLine>(raw, 'lines', ctx, path, readDiffLine, {
    required: true,
    max: LIMITS.maxDiffLines,
  });
  if (lines === undefined) return undefined;
  return compact({ header, lines }) as DiffHunk;
}

function readRenderViewEntry(value: unknown, ctx: Ctx, path: string): RenderViewEntry | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['name', 'image', 'coverage', 'partsVisible', 'partsOffCamera', 'distinctColours'], ctx, path);
  const name = readEnum(raw, 'name', VIEW_NAMES, ctx, path, { required: true });
  if (name === undefined) return undefined;
  const image = readImageField(raw, 'image', ctx, path);
  const coverage = readNumber(raw, 'coverage', ctx, path, { min: 0, max: 1 });
  const partsVisible = readNumber(raw, 'partsVisible', ctx, path, { min: 0, integer: true });
  const partsOffCamera = readNumber(raw, 'partsOffCamera', ctx, path, { min: 0, integer: true });
  const distinctColours = readNumber(raw, 'distinctColours', ctx, path, { min: 0, integer: true });
  if (ctx.errors.length) return undefined;
  return compact({ name, image, coverage, partsVisible, partsOffCamera, distinctColours }) as RenderViewEntry;
}

function readDefect(value: unknown, ctx: Ctx, path: string): CritiqueDefect | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['view', 'dimension', 'severity', 'observed', 'fix'], ctx, path);
  const view = readString(raw, 'view', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const dimension = readEnum(raw, 'dimension', CRITIQUE_DIMENSIONS, ctx, path, { required: true });
  const severity = readEnum(raw, 'severity', SEVERITIES, ctx, path, { required: true });
  const observed = readString(raw, 'observed', ctx, path, { required: true, max: 1200 });
  const fix = readString(raw, 'fix', ctx, path, { required: true, max: 1200 });
  if (view === undefined || dimension === undefined || severity === undefined) return undefined;
  if (observed === undefined || fix === undefined) return undefined;
  return { view, dimension, severity, observed, fix };
}

function readPropertyRow(value: unknown, ctx: Ctx, path: string): PropertyRow | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['name', 'value', 'changed', 'previous'], ctx, path);
  const name = readString(raw, 'name', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const val = readString(raw, 'value', ctx, path, { required: true, allowEmpty: true, max: LIMITS.maxLabelLength });
  const changed = readBoolean(raw, 'changed', ctx, path);
  const previous = readString(raw, 'previous', ctx, path, { max: LIMITS.maxLabelLength, allowEmpty: true });
  if (name === undefined || val === undefined) return undefined;
  return compact({ name, value: val, changed, previous }) as PropertyRow;
}

function readPropertyGroup(value: unknown, ctx: Ctx, path: string): PropertyGroup | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['name', 'rows'], ctx, path);
  const name = readString(raw, 'name', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const rows = readArray<PropertyRow>(raw, 'rows', ctx, path, readPropertyRow, { required: true });
  if (name === undefined || rows === undefined) return undefined;
  return { name, rows };
}

function readTestCase(value: unknown, ctx: Ctx, path: string): TestCase | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['name', 'status', 'durationMs', 'message'], ctx, path);
  const name = readString(raw, 'name', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const status = readEnum(raw, 'status', CASE_STATUSES, ctx, path, { required: true });
  const durationMs = readNumber(raw, 'durationMs', ctx, path, { min: 0 });
  const message = readString(raw, 'message', ctx, path, { max: 1200 });
  if (name === undefined || status === undefined) return undefined;
  return compact({ name, status, durationMs, message }) as TestCase;
}

function readAssetItem(value: unknown, ctx: Ctx, path: string): AssetItem | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['id', 'name', 'kind', 'thumbnail', 'creator', 'note', 'link'], ctx, path);
  const id = readString(raw, 'id', ctx, path, { required: true, max: 64 });
  const name = readString(raw, 'name', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const kind = readEnum(raw, 'kind', ASSET_KINDS, ctx, path, { required: true });
  if (id === undefined || name === undefined || kind === undefined) return undefined;
  const thumbnail = readImageField(raw, 'thumbnail', ctx, path);
  const creator = readString(raw, 'creator', ctx, path, { max: LIMITS.maxLabelLength });
  const note = readString(raw, 'note', ctx, path, { max: 600 });
  const link = readLinkField(raw, 'link', ctx, path);
  if (ctx.errors.length) return undefined;
  return compact({ id, name, kind, thumbnail, creator, note, link }) as AssetItem;
}

function readPlanStep(value: unknown, ctx: Ctx, path: string): PlanStep | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['title', 'detail', 'status', 'tool', 'durationMs'], ctx, path);
  const title = readString(raw, 'title', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const status = readEnum(raw, 'status', STEP_STATUSES, ctx, path, { required: true });
  const detail = readString(raw, 'detail', ctx, path, { max: 800 });
  const tool = readString(raw, 'tool', ctx, path, { max: 64 });
  const durationMs = readNumber(raw, 'durationMs', ctx, path, { min: 0 });
  if (title === undefined || status === undefined) return undefined;
  return compact({ title, detail, status, tool, durationMs }) as PlanStep;
}

function readFixSuggestion(value: unknown, ctx: Ctx, path: string): FixSuggestion | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['title', 'detail'], ctx, path);
  const title = readString(raw, 'title', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const detail = readString(raw, 'detail', ctx, path, { max: 1200 });
  if (title === undefined) return undefined;
  return compact({ title, detail }) as FixSuggestion;
}

function readExcerptLine(value: unknown, ctx: Ctx, path: string): ExcerptLine | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['text', 'n', 'marked'], ctx, path);
  const text = readString(raw, 'text', ctx, path, { required: true, allowEmpty: true, max: 2000 });
  const n = readNumber(raw, 'n', ctx, path, { min: 0, integer: true });
  const marked = readBoolean(raw, 'marked', ctx, path);
  if (text === undefined) return undefined;
  return compact({ text, n, marked }) as ExcerptLine;
}

function readChangeEntry(value: unknown, ctx: Ctx, path: string): ChangeEntry | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['kind', 'path', 'note'], ctx, path);
  const kind = readEnum(raw, 'kind', CHANGE_KINDS, ctx, path, { required: true });
  const p = readString(raw, 'path', ctx, path, { required: true, max: LIMITS.maxLabelLength });
  const note = readString(raw, 'note', ctx, path, { max: 600 });
  if (kind === undefined || p === undefined) return undefined;
  return compact({ kind, path: p, note }) as ChangeEntry;
}

function readSeriesPoint(value: unknown, ctx: Ctx, path: string): SeriesPoint | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  checkKeys(raw, ['day', 'value'], ctx, path);
  const day = readString(raw, 'day', ctx, path, { required: true, max: 32 });
  const value_ = readNumber(raw, 'value', ctx, path, { required: true, min: 0 });
  if (day === undefined || value_ === undefined) return undefined;
  return { day, value: value_ };
}

// ---------------------------------------------------------------------------
// Block readers
// ---------------------------------------------------------------------------

function readBlock(value: unknown, ctx: Ctx, path: string): Block | undefined {
  const raw = object(value, ctx, path);
  if (!raw) return undefined;
  const type = raw['type'];
  if (typeof type !== 'string') return fail(ctx, `${path}.type`, 'block type must be a string');
  if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
    return fail(ctx, `${path}.type`, `unknown block type "${truncateForMessage(type)}"`);
  }
  const before = ctx.errors.length;
  const block = buildBlock(type as BlockType, raw, ctx, path);
  if (ctx.errors.length > before) return undefined;
  return block;
}

function truncateForMessage(s: string): string {
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

function buildBlock(type: BlockType, raw: Record<string, unknown>, ctx: Ctx, path: string): Block | undefined {
  switch (type) {
    case 'heading': {
      checkKeys(raw, ['type', 'text', 'level'], ctx, path);
      const text = readString(raw, 'text', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const level = readNumberEnum(raw, 'level', HEADING_LEVELS, ctx, path);
      if (text === undefined) return undefined;
      return compact({ type, text, level }) as Block;
    }
    case 'text': {
      checkKeys(raw, ['type', 'text', 'tone'], ctx, path);
      const text = readString(raw, 'text', ctx, path, { required: true });
      const tone = readEnum<Tone>(raw, 'tone', TONES, ctx, path);
      if (text === undefined) return undefined;
      return compact({ type, text, tone }) as Block;
    }
    case 'list': {
      checkKeys(raw, ['type', 'items', 'ordered'], ctx, path);
      const items = readStringArray(raw, 'items', ctx, path, { required: true, maxLength: 1000 });
      const ordered = readBoolean(raw, 'ordered', ctx, path);
      if (items === undefined) return undefined;
      return compact({ type, items, ordered }) as Block;
    }
    case 'table': {
      checkKeys(raw, ['type', 'columns', 'rows', 'caption'], ctx, path);
      const columns = readStringArray(raw, 'columns', ctx, path, {
        required: true,
        max: LIMITS.maxTableColumns,
        maxLength: LIMITS.maxLabelLength,
      });
      if (columns === undefined) return undefined;
      const rows = readArray<string[]>(
        raw,
        'rows',
        ctx,
        path,
        (value, c, p) => {
          if (!Array.isArray(value)) return fail(c, p, `expected array of strings, got ${typeName(value)}`);
          if (value.length !== columns.length) {
            return fail(c, p, `row has ${value.length} cells but the table has ${columns.length} columns`);
          }
          const cells: string[] = [];
          for (let i = 0; i < value.length; i++) {
            const cell = value[i];
            if (typeof cell !== 'string') return fail(c, `${p}[${i}]`, `expected string, got ${typeName(cell)}`);
            if (cell.length > LIMITS.maxLabelLength) return fail(c, `${p}[${i}]`, 'cell text too long');
            cells.push(cell);
          }
          return cells;
        },
        { required: true },
      );
      if (rows === undefined) return undefined;
      const caption = readString(raw, 'caption', ctx, path, { max: LIMITS.maxLabelLength });
      return compact({ type, columns, rows, caption }) as Block;
    }
    case 'callout': {
      checkKeys(raw, ['type', 'tone', 'text', 'title', 'link'], ctx, path);
      const tone = readEnum<Tone>(raw, 'tone', TONES, ctx, path, { required: true });
      const text = readString(raw, 'text', ctx, path, { required: true });
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      const link = readLinkField(raw, 'link', ctx, path);
      if (tone === undefined || text === undefined) return undefined;
      return compact({ type, tone, text, title, link }) as Block;
    }
    case 'metric': {
      checkKeys(raw, ['type', 'label', 'value', 'unit', 'delta', 'hint', 'tone'], ctx, path);
      const label = readString(raw, 'label', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const value = readString(raw, 'value', ctx, path, { required: true, max: 64 });
      const unit = readString(raw, 'unit', ctx, path, { max: 24 });
      const delta = readString(raw, 'delta', ctx, path, { max: 32 });
      const hint = readString(raw, 'hint', ctx, path, { max: LIMITS.maxLabelLength });
      const tone = readEnum<Tone>(raw, 'tone', TONES, ctx, path);
      if (label === undefined || value === undefined) return undefined;
      return compact({ type, label, value, unit, delta, hint, tone }) as Block;
    }
    case 'key_values': {
      checkKeys(raw, ['type', 'items', 'title'], ctx, path);
      const items = readKeyValuesField(raw, 'items', ctx, path, { required: true });
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      if (items === undefined) return undefined;
      return compact({ type, items, title }) as Block;
    }
    case 'code_diff': {
      checkKeys(raw, ['type', 'path', 'hunks', 'language', 'summary'], ctx, path);
      const filePath = readString(raw, 'path', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const hunks = readArray<DiffHunk>(raw, 'hunks', ctx, path, readDiffHunk, {
        required: true,
        max: LIMITS.maxDiffHunks,
      });
      const language = readEnum(raw, 'language', CODE_LANGUAGES, ctx, path);
      const summary = readString(raw, 'summary', ctx, path, { max: 600 });
      if (filePath === undefined || hunks === undefined) return undefined;
      return compact({ type, path: filePath, hunks, language, summary }) as Block;
    }
    case 'scene_comparison': {
      checkKeys(raw, ['type', 'before', 'after', 'title', 'note'], ctx, path);
      const before = readSceneRefField(raw, 'before', ctx, path);
      const after = readSceneRefField(raw, 'after', ctx, path);
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      const note = readString(raw, 'note', ctx, path, { max: 800 });
      if (before === undefined || after === undefined) return undefined;
      return compact({ type, before, after, title, note }) as Block;
    }
    case 'render_review': {
      checkKeys(raw, ['type', 'subject', 'views', 'score', 'passed', 'unavailable', 'summary', 'lighting'], ctx, path);
      const subject = readString(raw, 'subject', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const views = readArray<RenderViewEntry>(raw, 'views', ctx, path, readRenderViewEntry, {
        required: true,
        max: 8,
      });
      if (subject === undefined || views === undefined) return undefined;
      const score = readNullableNumber(raw, 'score', ctx, path, { min: 0, max: 10 });
      const passed = readBoolean(raw, 'passed', ctx, path);
      const unavailable = readBoolean(raw, 'unavailable', ctx, path);
      const summary = readString(raw, 'summary', ctx, path, { max: 1200 });
      const lighting = readKeyValuesField(raw, 'lighting', ctx, path);
      if (ctx.errors.length) return undefined;
      return compact({ type, subject, views, score, passed, unavailable, summary, lighting }) as Block;
    }
    case 'visual_critique': {
      checkKeys(raw, ['type', 'score', 'passed', 'summary', 'defects', 'unavailable', 'hardFails'], ctx, path);
      const score = readNullableNumber(raw, 'score', ctx, path, { min: 0, max: 10 });
      const passed = readBoolean(raw, 'passed', ctx, path, { required: true });
      const summary = readString(raw, 'summary', ctx, path, { required: true, max: 1600 });
      const defects = readArray<CritiqueDefect>(raw, 'defects', ctx, path, readDefect, { required: true });
      const unavailable = readBoolean(raw, 'unavailable', ctx, path);
      const hardFails = readStringArray(raw, 'hardFails', ctx, path, { maxLength: 400 });
      if (score === undefined || passed === undefined || summary === undefined || defects === undefined) {
        return undefined;
      }
      return compact({ type, score, passed, summary, defects, unavailable, hardFails }) as Block;
    }
    case 'property_inspector': {
      checkKeys(raw, ['type', 'path', 'groups', 'className'], ctx, path);
      const instancePath = readString(raw, 'path', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const groups = readArray<PropertyGroup>(raw, 'groups', ctx, path, readPropertyGroup, { required: true });
      // NOTE: `className` here is the *Roblox* class (e.g. "Part"), rendered as text.
      // It is never used as a CSS class — see render.tsx.
      const className = readString(raw, 'className', ctx, path, { max: 64 });
      if (instancePath === undefined || groups === undefined) return undefined;
      return compact({ type, path: instancePath, groups, className }) as Block;
    }
    case 'test_report': {
      checkKeys(raw, ['type', 'passed', 'failed', 'cases', 'title', 'skipped', 'durationMs'], ctx, path);
      const passed = readNumber(raw, 'passed', ctx, path, { required: true, min: 0, integer: true });
      const failed = readNumber(raw, 'failed', ctx, path, { required: true, min: 0, integer: true });
      const cases = readArray<TestCase>(raw, 'cases', ctx, path, readTestCase, { required: true });
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      const skipped = readNumber(raw, 'skipped', ctx, path, { min: 0, integer: true });
      const durationMs = readNumber(raw, 'durationMs', ctx, path, { min: 0 });
      if (passed === undefined || failed === undefined || cases === undefined) return undefined;
      return compact({ type, passed, failed, cases, title, skipped, durationMs }) as Block;
    }
    case 'asset_picker': {
      checkKeys(raw, ['type', 'assets', 'title', 'actionLabel'], ctx, path);
      const assets = readArray<AssetItem>(raw, 'assets', ctx, path, readAssetItem, { required: true, max: 40 });
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      const actionLabel = readString(raw, 'actionLabel', ctx, path, { max: 48 });
      if (assets === undefined) return undefined;
      return compact({ type, assets, title, actionLabel }) as Block;
    }
    case 'build_plan': {
      checkKeys(raw, ['type', 'steps', 'title'], ctx, path);
      const steps = readArray<PlanStep>(raw, 'steps', ctx, path, readPlanStep, { required: true, max: 40 });
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      if (steps === undefined) return undefined;
      return compact({ type, steps, title }) as Block;
    }
    case 'error_diagnosis': {
      checkKeys(raw, ['type', 'title', 'severity', 'message', 'location', 'cause', 'fixes', 'excerpt'], ctx, path);
      const title = readString(raw, 'title', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const severity = readEnum(raw, 'severity', SEVERITIES, ctx, path, { required: true });
      const message = readString(raw, 'message', ctx, path, { required: true, max: 2000 });
      const location = readString(raw, 'location', ctx, path, { max: LIMITS.maxLabelLength });
      const cause = readString(raw, 'cause', ctx, path, { max: 1200 });
      const fixes = readArray<FixSuggestion>(raw, 'fixes', ctx, path, readFixSuggestion, { max: 10 });
      const excerpt = readArray<ExcerptLine>(raw, 'excerpt', ctx, path, readExcerptLine, { max: 60 });
      if (title === undefined || severity === undefined || message === undefined) return undefined;
      return compact({ type, title, severity, message, location, cause, fixes, excerpt }) as Block;
    }
    case 'checkpoint_comparison': {
      checkKeys(raw, ['type', 'left', 'right', 'changes'], ctx, path);
      const left = readCheckpointRefField(raw, 'left', ctx, path);
      const right = readCheckpointRefField(raw, 'right', ctx, path);
      const changes = readArray<ChangeEntry>(raw, 'changes', ctx, path, readChangeEntry, { max: 60 });
      if (left === undefined || right === undefined) return undefined;
      return compact({ type, left, right, changes }) as Block;
    }
    case 'progress': {
      checkKeys(raw, ['type', 'label', 'value', 'max', 'unit', 'tone', 'indeterminate'], ctx, path);
      const label = readString(raw, 'label', ctx, path, { required: true, max: LIMITS.maxLabelLength });
      const value = readNumber(raw, 'value', ctx, path, { required: true, min: 0 });
      const max = readNumber(raw, 'max', ctx, path, { min: 0 });
      const unit = readString(raw, 'unit', ctx, path, { max: 24 });
      const tone = readEnum<Tone>(raw, 'tone', TONES, ctx, path);
      const indeterminate = readBoolean(raw, 'indeterminate', ctx, path);
      if (label === undefined || value === undefined) return undefined;
      return compact({ type, label, value, max, unit, tone, indeterminate }) as Block;
    }
    case 'usage_summary': {
      checkKeys(raw, ['type', 'remaining', 'dailyLimit', 'usedToday', 'title', 'plan', 'resetsIn', 'series'], ctx, path);
      const remaining = readNumber(raw, 'remaining', ctx, path, { required: true, min: 0 });
      const dailyLimit = readNumber(raw, 'dailyLimit', ctx, path, { required: true, min: 0 });
      const usedToday = readNumber(raw, 'usedToday', ctx, path, { required: true, min: 0 });
      const title = readString(raw, 'title', ctx, path, { max: LIMITS.maxLabelLength });
      const plan = readEnum(raw, 'plan', PLANS, ctx, path);
      const resetsIn = readString(raw, 'resetsIn', ctx, path, { max: 32 });
      const series = readArray<SeriesPoint>(raw, 'series', ctx, path, readSeriesPoint, { max: 90 });
      if (remaining === undefined || dailyLimit === undefined || usedToday === undefined) return undefined;
      return compact({ type, remaining, dailyLimit, usedToday, title, plan, resetsIn, series }) as Block;
    }
    default: {
      // Unreachable: `type` was checked against BLOCK_TYPES above.
      return fail(ctx, `${path}.type`, 'unhandled block type');
    }
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Validate an AI-authored UI document. Returns a *rebuilt* document containing
 * only allowlisted keys, or a list of errors. Never throws.
 */
export function validateDocument(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const ctx: Ctx = { errors: [], warnings: [], strict: options.strictUnknownProps !== false };

  if (!isPlainObject(input)) {
    return { ok: false, errors: [`document: expected an object, got ${typeName(input)}`], warnings: [] };
  }

  const depth = structuralDepth(input);
  if (depth > LIMITS.maxInputDepth) {
    return {
      ok: false,
      errors: [
        depth === Number.POSITIVE_INFINITY
          ? 'document: contains a circular reference'
          : `document: nesting depth ${depth} exceeds the limit of ${LIMITS.maxInputDepth}`,
      ],
      warnings: [],
    };
  }

  const bytes = documentByteLength(input);
  if (bytes > LIMITS.maxDocumentBytes) {
    return {
      ok: false,
      errors: [`document: payload is ${bytes} bytes, limit is ${LIMITS.maxDocumentBytes}`],
      warnings: [],
    };
  }

  checkKeys(input, ['v', 'blocks', 'title'], ctx, 'document');

  const version = input['v'];
  if (version !== GENERATIVE_UI_VERSION) {
    fail(ctx, 'document.v', `unsupported schema version (expected ${GENERATIVE_UI_VERSION})`);
  }

  const title = readString(input, 'title', ctx, 'document', { max: LIMITS.maxLabelLength });

  const maxBlocks = Math.min(options.maxBlocks ?? LIMITS.maxBlocks, LIMITS.maxBlocks);
  const rawBlocks = input['blocks'];
  let blocks: Block[] | undefined;
  if (!Array.isArray(rawBlocks)) {
    fail(ctx, 'document.blocks', `expected an array, got ${typeName(rawBlocks)}`);
  } else if (rawBlocks.length === 0) {
    fail(ctx, 'document.blocks', 'document has no blocks');
  } else if (rawBlocks.length > maxBlocks) {
    fail(ctx, 'document.blocks', `document has ${rawBlocks.length} blocks, limit is ${maxBlocks}`);
  } else {
    const out: Block[] = [];
    for (let i = 0; i < rawBlocks.length; i++) {
      const block = readBlock(rawBlocks[i], ctx, `blocks[${i}]`);
      if (block !== undefined) out.push(block);
    }
    blocks = out;
  }

  if (ctx.errors.length > 0 || blocks === undefined) {
    return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  }

  const doc: UIDocument = compact({ v: GENERATIVE_UI_VERSION, blocks, title }) as UIDocument;
  return { ok: true, doc, warnings: ctx.warnings };
}

/** Validate from a JSON string. Malformed JSON is a validation failure, not a throw. */
export function parseDocument(json: string, options: ValidateOptions = {}): ValidationResult {
  if (typeof json !== 'string') {
    return { ok: false, errors: ['document: expected a JSON string'], warnings: [] };
  }
  if (json.length > LIMITS.maxDocumentBytes) {
    return { ok: false, errors: ['document: JSON string exceeds the size limit'], warnings: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`document: invalid JSON — ${(e as Error).message}`], warnings: [] };
  }
  return validateDocument(parsed, options);
}

/**
 * Lenient path: drop unknown properties rather than refusing the document.
 * Used when a *trusted* producer (our own adapters) may be ahead of this schema.
 * The result is still rebuilt from the allowlist, so nothing extra gets through.
 */
export function sanitizeDocument(input: unknown, options: ValidateOptions = {}): ValidationResult {
  return validateDocument(input, { ...options, strictUnknownProps: false });
}

/**
 * Pull a ```golem-ui fenced JSON block out of assistant markdown.
 * Returns the JSON text and the message with the fence removed, so the panel is
 * rendered as a real component rather than printed as code.
 */
export function extractUIFence(markdown: string): { json: string | null; rest: string } {
  if (typeof markdown !== 'string' || !markdown.includes('golem-ui')) return { json: null, rest: markdown };
  const match = /```golem-ui[ \t]*\r?\n([\s\S]*?)```/.exec(markdown);
  if (!match || match[1] === undefined) return { json: null, rest: markdown };
  const rest = (markdown.slice(0, match.index) + markdown.slice(match.index + match[0].length)).trim();
  return { json: match[1], rest };
}
