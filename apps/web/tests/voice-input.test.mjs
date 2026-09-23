/**
 * THE COMPOSER MICROPHONE SENDS A CHILD'S VOICE ONLY TO APPLE (D-VISION-1).
 *
 * The mic used the browser's Web Speech API. In Chrome that streams the recording to Google's
 * servers — a child's voice leaving through a party the product never chose. The mic now records in
 * the page, converts to a 16 kHz WAV and posts it to the worker's /api/voice/transcribe, which
 * transcribes and keeps nothing (apps/worker/tests/voice-transcribe.test.mjs owns that half).
 *
 * `encodeWav` and `transcribeVoice` are EXECUTED. The component itself is read as source (apps/web
 * has no DOM renderer), comments stripped, so this file's own prose cannot satisfy it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const out = join(mkdtempSync(join(tmpdir(), 'voice-')), 'voice.mjs');
execFileSync(ESBUILD, [join(WEB, 'src', 'lib', 'voice-transcribe.ts'), '--bundle', '--format=esm', '--platform=neutral',
  '--main-fields=main,module', '--define:import.meta.env={}', '--outfile=' + out], { stdio: 'pipe' });
const V = await import(`file://${out}`);

const code = (rel) => readFileSync(join(WEB, rel), 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');

test('encodeWav writes a 16-bit mono PCM WAV the worker can measure', () => {
  const n = V.VOICE_RATE; // one second
  const wav = V.encodeWav(new Float32Array(n).fill(0.5));
  const v = new DataView(wav.buffer);
  const tag = (o) => String.fromCharCode(...wav.slice(o, o + 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 1, 'mono');
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(34, true), 16, '16-bit');
  assert.equal(v.getUint32(40, true), n * 2, 'data length = one second of samples');
  assert.equal(wav.byteLength, 44 + n * 2);
  assert.equal(v.getInt16(44, true), Math.trunc(0.5 * 0x7fff), 'a sample survives the conversion');
});

test('a minute of 16 kHz speech fits the worker byte cap', () => {
  const bytes = 44 + V.VOICE_MAX_SECONDS * V.VOICE_RATE * 2;
  assert.ok(bytes <= 2_000_000, `${bytes} bytes would be refused with 413`);
});

test('transcribeVoice posts the WAV to Apple\'s worker, and returns the words', async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return Response.json({ heard: true, text: 'build me a red tower', provider: 'workers-ai' }); };
  const wav = new Blob([V.encodeWav(new Float32Array(1600))], { type: 'audio/wav' });
  const t = await V.transcribeVoice(wav, fetcher);
  assert.deepEqual({ heard: t.heard, text: t.text }, { heard: true, text: 'build me a red tower' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/voice/transcribe', 'same-origin worker route, nobody else');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'audio/wav');
  assert.equal(calls[0].init.body, wav);
});

test('a refusal reaches the person as the worker\'s sentence, and a dropped connection as a plain one', async () => {
  const refused = async () => Response.json({ error: 'That was longer than a minute. Try a shorter message.' }, { status: 413 });
  await assert.rejects(V.transcribeVoice(new Blob([]), refused), /longer than a minute/);
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(V.transcribeVoice(new Blob([]), offline), /Check your connection/);
});

test('the mic records for the worker and no longer uses the browser\'s speech recognition', () => {
  const src = code('src/components/picks/composer/voice-input.tsx');
  assert.doesNotMatch(src, /SpeechRecognition/, 'Web Speech in Chrome sends the voice to Google');
  assert.match(src, /new MediaRecorder\(/);
  assert.match(src, /recordingToWav\([^)]*\)[\s\S]{0,80}transcribeVoice\(/);
  assert.match(src, /onTextRef\.current\(t\.text\)/, 'the words go into the composer box');
  assert.match(src, /VOICE_MAX_SECONDS\)\s*finish\(true\)/, 'recording stops at the worker\'s limit');
  assert.match(src, /if \(!keep\.current[^)]*\) return;/, 'a cancelled recording is never sent');
});

test('the mic is still mounted in the composer', () => {
  assert.match(code('src/components/ws/composer.tsx'), /<VoiceInput onText=\{insertPhrase\}/);
});
