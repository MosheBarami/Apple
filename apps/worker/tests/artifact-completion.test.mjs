import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestedArtifactTool, artifactCompletion } from '../src/artifact-completion.ts';

test('direct generation commands require their actual artifact tool', () => {
  for (const request of ['Generate exactly one image: a silver moon.', 'Create a picture of a fox', 'Please draw an icon', 'צור תמונה של ירח']) {
    assert.equal(requestedArtifactTool(request), 'generate_image', request);
  }
  // D-MODELLIB-2: a requested 3D model is proven by a library insert, never by a generator.
  assert.equal(requestedArtifactTool('Generate a 3D model using generate_model in my connected Studio.'), 'insert_library_model');
});

test('the session verifies artifact evidence before exposing prose and again before finalizing', () => {
  const source = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const step = source.slice(source.indexOf('private async runStep'), source.indexOf('private async finishRun'));
  assert.ok(step.indexOf('artifactCompletion(') >= 0);
  assert.ok(step.indexOf('artifactCompletion(') < step.indexOf("type: 'delta'"));
  const finish = source.slice(source.indexOf('private async finishRun'));
  assert.match(finish, /artifactCompletion\(/);
  assert.match(finish, /reason\s*=\s*'incomplete'/);
});

test('questions, greetings and negations do not authorize artifact creation', () => {
  for (const request of ['hi', 'How do I generate an image?', 'Do not generate an image', 'Explain generate_image', 'Build a shop. Do not generate an image.', 'אל תיצור תמונה', 'Create an image label in StarterGui', 'Create a shop with an image', 'Generate a script to create an image']) {
    assert.equal(requestedArtifactTool(request), null, request);
  }
});

test('prose, unrelated tools and failed tools cannot prove artifact delivery', () => {
  assert.deepEqual(artifactCompletion('Generate an image', []), { tool: 'generate_image', missing: true, attempted: false });
  assert.equal(artifactCompletion('Generate an image', [{ tool: 'search_assets', ok: true }]).missing, true);
  assert.deepEqual(artifactCompletion('Generate an image', [{ tool: 'generate_image', ok: false }]), { tool: 'generate_image', missing: true, attempted: true });
  assert.equal(artifactCompletion('Generate an image', [{ tool: 'generate_image', ok: true }]).missing, false);
});
