import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(tmpdir(), `studpilot-vision-preflight-${process.pid}.mjs`);
execFileSync(join(root, 'node_modules/.bin/esbuild'), ['--bundle', '--format=esm', '--platform=node', '--target=es2022', `--outfile=${output}`, '--log-level=error'], {
  input: `export {workersAiAdapter} from '${root}src/providers/workers-ai.ts'; export {contentChars} from '${root}src/providers/types.ts'; export {estimateNeurons,maxNeuronsPerStepFor} from '${root}src/pricing.ts';`,
  cwd: root,
});
const { workersAiAdapter, contentChars, estimateNeurons, maxNeuronsPerStepFor } = await import(`file://${output}`);
rmSync(output, { force: true });
const model = '@cf/zai-org/glm-5.3-flash';
// Optional native frame for local evidence; normal tests need no private owner fixture.
// Validation of image bytes happens before this transport/preflight boundary.
const frame = process.env.STUDPILOT_VISION_PREFLIGHT_FRAME
  ? readFileSync(process.env.STUDPILOT_VISION_PREFLIGHT_FRAME) : Buffer.alloc(410850, 0x61);
const url = 'data:image/jpeg;base64,' + frame.toString('base64');
const image = { type: 'image_url', image_url: { url } };
test('large inline screenshot survives encoding and fits vision preflight without weakening the cap', () => {
  const encoded = workersAiAdapter.encode({modelId:model,messages:[{role:'user',content:[{type:'text',text:'Inspect actual pixels.'},image]}],maxTokens:4000,temperature:0});
  assert.equal(encoded.payload.messages[0].content[1].image_url.url, url);
  const oldEstimate = estimateNeurons(model, url.length + 22, 4000);
  const estimate = estimateNeurons(model, encoded.promptChars, 4000);
  assert.ok(oldEstimate > maxNeuronsPerStepFor(model));
  assert.ok(estimate < maxNeuronsPerStepFor(model));
  assert.equal(contentChars([image], model), 8128 * 3.5);
  console.log(JSON.stringify({frameBytes:frame.length,oldEstimate,estimate,cap:maxNeuronsPerStepFor(model)}));
});
test('unknown models and remote images retain length accounting; repeated images still hit spend cap', () => {
  assert.equal(contentChars([image], 'unknown'), url.length);
  const remote = {type:'image_url',image_url:{url:'https://example.com/frame.jpg'}};
  assert.equal(contentChars([remote], model), remote.image_url.url.length);
  assert.ok(estimateNeurons(model, contentChars(Array(20).fill(image), model), 4000) > maxNeuronsPerStepFor(model));
});
