// Public surface of the generative-UI system.
//
// Rule for callers: never render `input` directly. Either use <GenerativeUIPanel>
// (validate-then-render, safe fallback on failure) or validate first and render
// the returned document. There is no other supported path.
//
// The renderer itself (<GenerativeUI>, <GenerativeUIPanel>, <GenerativeUIFallback>) is imported
// from './render' and is NOT re-exported here: it is loaded lazily, only when a reply or its
// Details has something to draw (components/ws/turn.tsx, thinking.tsx), and a re-export from this
// index would put it back in the page everybody loads first.
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
