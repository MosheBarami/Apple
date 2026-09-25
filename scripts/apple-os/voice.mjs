import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const modelPath = () => process.env.APPLE_OS_WHISPER_MODEL || join(homedir(), '.cache/hyperframes/whisper/models/ggml-small.en.bin');
const kokoroRoot = () => process.env.APPLE_OS_KOKORO_ROOT || join(homedir(), 'Documents/Apple-OS/runtime');
const kokoroPaths = () => ({ python: join(kokoroRoot(), 'kokoro-venv/bin/python'),
  model: join(kokoroRoot(), 'kokoro-model/kokoro-v1.0.onnx'), voices: join(kokoroRoot(), 'kokoro-model/voices-v1.0.bin') });
const available = (name) => { try { execFileSync('/usr/bin/which', [name], { stdio: 'ignore', timeout: 2000 }); return true; } catch { return false; } };

export function voiceStatus() {
  const k = kokoroPaths();
  const kokoro = existsSync(k.python) && existsSync(k.model) && existsSync(k.voices);
  return { whisper: available('whisper-cli') && available('ffmpeg') && existsSync(modelPath()),
    whisperModel: existsSync(modelPath()) ? 'small.en local' : null,
    speechOutput: kokoro ? 'Kokoro local (English); macOS say (Hebrew)' : available('say') ? 'macOS local say' : null,
    kokoro };
}

export function transcribeFile(input) {
  if (!input || !existsSync(input)) throw new Error('audio file does not exist');
  if (!voiceStatus().whisper) throw new Error('local Whisper is not installed or its model is missing');
  const dir = mkdtempSync(join(tmpdir(), 'apple-os-voice-'));
  try {
    const wav = join(dir, 'input.wav');
    execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
      { timeout: 120_000, stdio: 'pipe' });
    execFileSync('whisper-cli', ['-m', modelPath(), '-f', wav, '-l', 'en', '-otxt', '-of', join(dir, 'transcript'), '-np'],
      { timeout: 30 * 60_000, stdio: 'pipe' });
    return readFileSync(join(dir, 'transcript.txt'), 'utf8').trim();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function speakLocal(text) {
  const phrase = String(text);
  if (!phrase || phrase.length > 1000) throw new Error('speech output needs 1–1000 characters');
  const k = kokoroPaths();
  if (voiceStatus().kokoro && !/\p{Script=Hebrew}/u.test(phrase)) {
    const dir = mkdtempSync(join(tmpdir(), 'apple-os-speech-'));
    try {
      const audio = join(dir, 'speech.wav');
      execFileSync(k.python, [join(import.meta.dirname, 'kokoro.py'), k.model, k.voices, audio],
        { input: JSON.stringify({ text: phrase, voice: 'af_sarah' }), encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('afplay', [audio], { timeout: 120_000, stdio: 'ignore' });
      return 'kokoro';
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (!available('say')) throw new Error('macOS say is not available');
  execFileSync('say', [phrase], { timeout: 60_000, stdio: 'ignore' });
  return 'macos-say';
}
