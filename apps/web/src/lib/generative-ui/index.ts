// Public surface of the generative-UI system.
//
// Rule for callers: never render `input` directly. Either use <GenerativeUIPanel>
// (validate-then-render, safe fallback on failure) or validate first and render
// the returned document. There is no other supported path.
export * from './schema';
export {
  documentByteLength,
  extractUIFence,
  isSafeHref,
  isSafeImageSrc,
  parseDocument,
  sanitizeDocument,
  structuralDepth,
  validateDocument,
  type ValidateOptions,
  type ValidationFail,
  type ValidationOk,
  type ValidationResult,
} from './validate';
export { GenerativeUI, GenerativeUIFallback, GenerativeUIPanel } from './render';
export {
  checkpointComparisonToDocument,
  comparisonToDocument,
  critiqueToDocument,
  documentFromToolDetail,
  documentOrNull,
  quotaToDocument,
  renderResultToDocument,
  rgbBase64ToPngDataUrl,
  type CritiqueLike,
} from './adapters';
