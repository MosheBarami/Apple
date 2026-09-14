/**
 * Apple generative UI — schema (v1).
 *
 * The agent may present product interfaces, but ONLY by emitting a document that
 * matches this schema. It can never emit HTML, CSS, class names, style objects,
 * event handlers or arbitrary colour values: every visual decision is expressed
 * as a token drawn from a closed enum below, and resolved to real CSS by the
 * renderer.
 *
 * This file is intentionally *types + constants only* so it can be imported by
 * the validator (plain TS, runs under `node --test` via native type stripping),
 * by the React renderer, and by tests, without dragging React in.
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Bump when a block's props change shape. Documents carrying another version are refused. */
export const GENERATIVE_UI_VERSION = 1;

// ---------------------------------------------------------------------------
// Closed token enums — the only "styling" the agent can express
// ---------------------------------------------------------------------------

export const TONES = ['neutral', 'accent', 'info', 'good', 'warn', 'bad'] as const;
export type Tone = (typeof TONES)[number];

export const SEVERITIES = ['blocking', 'major', 'minor'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const HEADING_LEVELS = [2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Mirrors RENDER_VIEWS in @golem/shared; duplicated so this module stays dependency-free. */
export const VIEW_NAMES = ['hero', 'front', 'side', 'top', 'eye'] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

/** Mirrors VisualDefect['dimension'] in apps/worker/src/vision.ts. */
export const CRITIQUE_DIMENSIONS = [
  'composition',
  'proportion',
  'materials',
  'colour',
  'lighting',
  'detail',
  'ground',
  'fidelity',
] as const;
export type CritiqueDimension = (typeof CRITIQUE_DIMENSIONS)[number];

export const CODE_LANGUAGES = ['luau', 'lua', 'ts', 'js', 'json', 'text'] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const DIFF_LINE_KINDS = ['add', 'del', 'ctx'] as const;
export type DiffLineKind = (typeof DIFF_LINE_KINDS)[number];

export const STEP_STATUSES = ['done', 'active', 'pending', 'blocked'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const CASE_STATUSES = ['pass', 'fail', 'skip'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const ASSET_KINDS = ['model', 'image', 'sound', 'mesh', 'animation', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const CHANGE_KINDS = ['added', 'removed', 'changed'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

// ---------------------------------------------------------------------------
// Hard limits. Every one of these is enforced by the validator.
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** Serialised size of the whole document. */
  maxDocumentBytes: 512 * 1024,
  /** Structural depth of the *raw* input, checked before schema matching. */
  maxInputDepth: 10,
  /** Top-level blocks in one document. */
  maxBlocks: 40,
  /** Any array inside a block. */
  maxArrayItems: 120,
  /** Any single string field. */
  maxStringLength: 4000,
  /** Short string fields (labels, paths, names). */
  maxLabelLength: 200,
  /** Table shape. */
  maxTableColumns: 12,
  /** Diff hunks per code_diff and lines per hunk. */
  maxDiffHunks: 20,
  maxDiffLines: 400,
  /** Base64 payload length for an embedded image (~1.5 MB decoded). */
  maxImageDataLength: 2_000_000,
} as const;

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

/**
 * An image the agent may show. `src` must be a base64 data URL of a raster image —
 * exactly the shape `apps/worker/src/png.ts` produces from a Studio render. No
 * remote URLs, no SVG (SVG can carry script), no blob: or filesystem paths.
 */
export interface ImageRef {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

/** A link the agent may show. Only https:, in-app absolute paths and fragments. */
export interface LinkRef {
  href: string;
  label: string;
}

export interface KeyValue {
  key: string;
  value: string;
  tone?: Tone;
}

export interface SceneRef {
  label: string;
  image?: ImageRef;
  stats?: KeyValue[];
}

export interface CheckpointRef {
  label: string;
  when?: string;
  scriptCount?: number;
  instanceCount?: number;
  sizeBytes?: number;
}

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  n?: number;
}

export interface DiffHunk {
  header?: string;
  lines: DiffLine[];
}

export interface RenderViewEntry {
  name: ViewName;
  image?: ImageRef;
  /** 0..1 fraction of the frame covered by geometry. */
  coverage?: number;
  partsVisible?: number;
  partsOffCamera?: number;
  distinctColours?: number;
}

export interface CritiqueDefect {
  view: string;
  dimension: CritiqueDimension;
  severity: Severity;
  observed: string;
  fix: string;
}

export interface PropertyRow {
  name: string;
  value: string;
  changed?: boolean;
  previous?: string;
}

export interface PropertyGroup {
  name: string;
  rows: PropertyRow[];
}

export interface TestCase {
  name: string;
  status: CaseStatus;
  durationMs?: number;
  message?: string;
}

export interface AssetItem {
  id: string;
  name: string;
  kind: AssetKind;
  thumbnail?: ImageRef;
  creator?: string;
  note?: string;
  link?: LinkRef;
}

export interface PlanStep {
  title: string;
  detail?: string;
  status: StepStatus;
  tool?: string;
  durationMs?: number;
}

export interface FixSuggestion {
  title: string;
  detail?: string;
}

export interface ExcerptLine {
  text: string;
  n?: number;
  marked?: boolean;
}

export interface ChangeEntry {
  kind: ChangeKind;
  path: string;
  note?: string;
}

export interface SeriesPoint {
  day: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export interface HeadingBlock {
  type: 'heading';
  text: string;
  level?: HeadingLevel;
}

export interface TextBlock {
  type: 'text';
  text: string;
  tone?: Tone;
}

export interface ListBlock {
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface TableBlock {
  type: 'table';
  columns: string[];
  rows: string[][];
  caption?: string;
}

export interface CalloutBlock {
  type: 'callout';
  tone: Tone;
  text: string;
  title?: string;
  link?: LinkRef;
}

export interface MetricBlock {
  type: 'metric';
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  hint?: string;
  tone?: Tone;
}

export interface KeyValuesBlock {
  type: 'key_values';
  items: KeyValue[];
  title?: string;
}

export interface CodeDiffBlock {
  type: 'code_diff';
  path: string;
  hunks: DiffHunk[];
  language?: CodeLanguage;
  summary?: string;
}

export interface SceneComparisonBlock {
  type: 'scene_comparison';
  before: SceneRef;
  after: SceneRef;
  title?: string;
  note?: string;
}

export interface RenderReviewBlock {
  type: 'render_review';
  subject: string;
  views: RenderViewEntry[];
  score?: number | null;
  passed?: boolean;
  unavailable?: boolean;
  summary?: string;
  lighting?: KeyValue[];
}

export interface VisualCritiqueBlock {
  type: 'visual_critique';
  score: number | null;
  passed: boolean;
  summary: string;
  defects: CritiqueDefect[];
  unavailable?: boolean;
  hardFails?: string[];
}

export interface PropertyInspectorBlock {
  type: 'property_inspector';
  path: string;
  groups: PropertyGroup[];
  className?: string;
}

export interface TestReportBlock {
  type: 'test_report';
  passed: number;
  failed: number;
  cases: TestCase[];
  title?: string;
  skipped?: number;
  durationMs?: number;
}

export interface AssetPickerBlock {
  type: 'asset_picker';
  assets: AssetItem[];
  title?: string;
  actionLabel?: string;
}

export interface BuildPlanBlock {
  type: 'build_plan';
  steps: PlanStep[];
  title?: string;
}

export interface ErrorDiagnosisBlock {
  type: 'error_diagnosis';
  title: string;
  severity: Severity;
  message: string;
  location?: string;
  cause?: string;
  fixes?: FixSuggestion[];
  excerpt?: ExcerptLine[];
}

export interface CheckpointComparisonBlock {
  type: 'checkpoint_comparison';
  left: CheckpointRef;
  right: CheckpointRef;
  changes?: ChangeEntry[];
}

export interface ProgressBlock {
  type: 'progress';
  label: string;
  value: number;
  max?: number;
  unit?: string;
  tone?: Tone;
  indeterminate?: boolean;
}

export interface UsageSummaryBlock {
  type: 'usage_summary';
  remaining: number;
  dailyLimit: number;
  usedToday: number;
  title?: string;
  plan?: Plan;
  resetsIn?: string;
  series?: SeriesPoint[];
}

export type Block =
  | HeadingBlock
  | TextBlock
  | ListBlock
  | TableBlock
  | CalloutBlock
  | MetricBlock
  | KeyValuesBlock
  | CodeDiffBlock
  | SceneComparisonBlock
  | RenderReviewBlock
  | VisualCritiqueBlock
  | PropertyInspectorBlock
  | TestReportBlock
  | AssetPickerBlock
  | BuildPlanBlock
  | ErrorDiagnosisBlock
  | CheckpointComparisonBlock
  | ProgressBlock
  | UsageSummaryBlock;

export type BlockType = Block['type'];

export const BLOCK_TYPES = [
  'heading',
  'text',
  'list',
  'table',
  'callout',
  'metric',
  'key_values',
  'code_diff',
  'scene_comparison',
  'render_review',
  'visual_critique',
  'property_inspector',
  'test_report',
  'asset_picker',
  'build_plan',
  'error_diagnosis',
  'checkpoint_comparison',
  'progress',
  'usage_summary',
] as const;

/** A whole AI-authored panel. `title` is optional chrome for the work surface. */
export interface UIDocument {
  v: number;
  blocks: Block[];
  title?: string;
}
