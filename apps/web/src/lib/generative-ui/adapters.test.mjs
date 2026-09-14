import test from 'node:test';
import assert from 'node:assert/strict';

import { documentFromToolDetail } from './adapters.ts';

/**
 * Regression: the `render_view` tool result must not be mistaken for a renderable
 * RenderViewResult.
 *
 * `render_view` (apps/worker/src/tools.ts) deliberately strips the images — they are ~60KB each
 * and tool results are re-sent on every later step — and returns a flattened, model-facing
 * summary. The old `looksLikeRenderResult` checked only `subject` and `views`, both of which
 * that summary has, so it was admitted and `renderResultToDocument` dereferenced
 * `result.boundsSize.map(...)` on `undefined`, throwing inside render.
 */
const RENDER_VIEW_TOOL_RESULT = {
  subject: 'Workspace/InteractiveDoor',
  boundsSizeStuds: [8, 10, 1],
  views: [
    { view: 'hero', width: 512, height: 512, partsVisible: 9, partsOffCamera: 0, subjectCoverage: 0.42, distinctColours: 6 },
    { view: 'front', width: 512, height: 512, partsVisible: 9, partsOffCamera: 0, subjectCoverage: 0.51, distinctColours: 6 },
  ],
};

test('render_view tool summary does not throw and does not fake a panel', () => {
  let out;
  assert.doesNotThrow(() => {
    out = documentFromToolDetail(RENDER_VIEW_TOOL_RESULT);
  }, 'the image-free render_view summary must never reach renderResultToDocument');
  assert.equal(out, null, 'an image-free summary must fall through to the plain tool row');
});

test('a genuine RenderViewResult with pixels still renders', () => {
  const real = {
    subject: 'Workspace/InteractiveDoor',
    boundsSize: [8, 10, 1],
    views: [
      {
        name: 'hero',
        rgbBase64: '',
        meta: {
          width: 2,
          height: 1,
          partsConsidered: 9,
          partsVisible: 9,
          partsOffCamera: 0,
          subjectCoverage: 0.42,
          distinctColours: 6,
          materials: [{ material: 'Wood', parts: 4 }],
        },
      },
    ],
  };
  const doc = documentFromToolDetail(real);
  assert.ok(doc, 'a real render result must still produce a document');
});

test('partial / malformed bounds are rejected rather than dereferenced', () => {
  for (const bounds of [undefined, null, [1, 2], 'big', [1, 2, Number.NaN]]) {
    const payload = {
      subject: 's',
      boundsSize: bounds,
      views: [{ name: 'hero', rgbBase64: '', meta: { width: 1, height: 1 } }],
    };
    assert.doesNotThrow(() => documentFromToolDetail(payload));
    assert.equal(documentFromToolDetail(payload), null, `bounds ${JSON.stringify(bounds)} must be rejected`);
  }
});

test('views without pixels are rejected', () => {
  const payload = {
    subject: 's',
    boundsSize: [1, 2, 3],
    views: [{ view: 'hero', width: 512, height: 512 }],
  };
  assert.equal(documentFromToolDetail(payload), null);
});

// --- evidence panel: the worker now pre-encodes the hero frame -----------------

test('a view whose image is already encoded renders, without re-encoding in the browser', () => {
  // The worker encodes the hero as a PNG before sending, because converting in the browser meant
  // shipping ~207KB of raw base64 RGB to deliver a ~25KB picture.
  const doc = documentFromToolDetail({
    render: {
      subject: 'Workspace/InteractiveDoor',
      boundsSize: [8, 10, 1],
      views: [{ name: 'hero', pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=', meta: { width: 288, height: 180 } }],
    },
    critique: { score: 7.5, passed: true, summary: 'reads as a door', defects: [] },
  });
  assert.ok(doc, 'a pre-encoded evidence panel must render');
});

test('a view with NEITHER raw rows nor an encoded image is still rejected', () => {
  // This is the image-free render_view summary. Forcing it into a visual panel is what used to
  // dereference an absent field and take the workspace to the ErrorBoundary.
  const doc = documentFromToolDetail({
    subject: 's',
    boundsSize: [1, 2, 3],
    views: [{ name: 'hero', meta: { width: 288, height: 180 } }],
  });
  assert.equal(doc, null);
});

test('a pngDataUrl that is not an image data URL is rejected', () => {
  // Otherwise any string in that field becomes an <img src>, which is a way to point the browser
  // at something that is not a picture.
  for (const bad of ['javascript:alert(1)', 'https://example.com/x.png', 'data:text/html,<b>', '']) {
    const doc = documentFromToolDetail({
      subject: 's', boundsSize: [1, 2, 3],
      views: [{ name: 'hero', pngDataUrl: bad, meta: { width: 8, height: 8 } }],
    });
    assert.equal(doc, null, `pngDataUrl=${JSON.stringify(bad)} must be rejected`);
  }
});
