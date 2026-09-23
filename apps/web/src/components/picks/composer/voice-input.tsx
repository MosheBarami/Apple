// TALK INSTEAD OF TYPE — the composer's microphone. Four picks in one control:
//
//   AI Elements "speech-input"   record the voice (MediaRecorder) and have APPLE'S WORKER transcribe
//                                it — English, transcribed then deleted, never stored (D-VISION-1).
//                                Not the browser's Web Speech API: in Chrome that ships a child's
//                                voice to Google. Hidden where the browser cannot record.
//   React Bits "Voice Pill"      tap to dictate, hold to talk, slide left to cancel; while it
//                                listens the button stretches into a pill with a timer and a live
//                                level trace. (MIT + Commons Clause: rebuilt, not copied.)
//   AI Elements "transcription"  a line above the bar while it listens and while the words are
//                                being written down, so nobody talks into a void.
//   AI Elements "mic-selector"   which microphone, but only when there is more than one to choose
//                                between; one microphone needs no menu.
//
// What was said is handed to `onText` once, when the worker answers, and goes into the box at the
// caret like any other insertion. Nothing is sent: the person reads it, fixes it, and sends it.
// Recording stops by itself at VOICE_MAX_SECONDS, the worker's limit.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, PATH } from '../../ws/primitives';
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
} from '../../ai-elements/prompt-input';
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../../ai-elements/ui/dropdown-menu';
import { reducedMotion } from './motion';
import { VOICE_MAX_SECONDS, recordingToWav, transcribeVoice } from '../../../lib/voice-transcribe';
import './voice-input.css';

function canRecord(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && !!navigator.mediaDevices?.getUserMedia;
}

const MIC_KEY = 'apple.composer.mic';
const HOLD_MS = 350;
const CANCEL_PX = 70;

function readMic(): string {
  try { return localStorage.getItem(MIC_KEY) ?? ''; } catch { return ''; }
}
function writeMic(id: string) {
  try { localStorage.setItem(MIC_KEY, id); } catch { /* private window: the choice lasts this visit */ }
}

export interface VoiceInputProps {
  onText: (text: string) => void;
  onNotice?: (message: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onText, onNotice, disabled }: VoiceInputProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [writing, setWriting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [slide, setSlide] = useState(0);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mic, setMic] = useState(readMic);

  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const press = useRef<{ x: number; at: number; was: boolean; id: number } | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => setSupported(canRecord()), []);

  const listMics = async () => {
    try {
      const all = await navigator.mediaDevices?.enumerateDevices?.();
      const inputs = (all ?? []).filter((d) => d.kind === 'audioinput' && d.deviceId && d.label);
      setMics(inputs);
    } catch { setMics([]); }
  };

  const release = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => {});
    audio.current = null;
  };

  // THE LEVEL TRACE: bars scroll leftward, newest at the right, each one the loudness of a moment.
  const trace = (analyser: AnalyserNode | null) => {
    const cv = canvas.current;
    if (!cv || reducedMotion()) return;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const bars: number[] = [];
    let tick = 0;
    const draw = () => {
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cv.clientWidth * dpr));
      const h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      let level = 0.06;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      }
      tick = (tick + 1) % 4;
      if (tick === 0) { bars.push(level); if (bars.length > 60) bars.shift(); }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(cv).color;
      const bw = 2 * dpr;
      const step = 3 * dpr;
      for (let i = 0; i < bars.length; i += 1) {
        const v = bars[bars.length - 1 - i] ?? 0;
        const x = w - (i + 1) * step;
        if (x + bw < 0) break;
        const bh = Math.max(bw, (0.12 + 0.88 * v) * h);
        const fade = Math.min(1, Math.max(0, x / (w * 0.5)));
        ctx.globalAlpha = (0.35 + 0.65 * v) * fade;
        ctx.fillRect(x, (h - bh) / 2, bw, bh);
      }
      ctx.globalAlpha = 1;
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
  };

  const begin = async () => {
    if (rec.current || writing) return;
    keep.current = true;
    chunks.current = [];
    setSeconds(0);
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: mic ? { deviceId: { exact: mic } } : true });
    } catch (e) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
      onNotice?.(name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone is blocked. Allow it for this site to talk instead of typing.');
      return;
    }
    stream.current = s;
    const r = new MediaRecorder(s);
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    r.onstop = () => {
      const recording = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
      chunks.current = [];
      rec.current = null;
      release();
      setListening(false);
      setSlide(0);
      if (!keep.current || recording.size === 0) return;
      // The recording lives in this page only until the worker has the WAV; nothing keeps it.
      setWriting(true);
      void recordingToWav(recording)
        .then((wav) => transcribeVoice(wav))
        .then((t) => {
          if (t.heard && t.text) onTextRef.current(t.text);
          else onNotice?.('I did not hear any words. Try again a little closer to the microphone.');
        })
        .catch((err: unknown) => onNotice?.(err instanceof Error ? err.message : 'Voice typing did not work. You can still type.'))
        .finally(() => setWriting(false));
    };
    r.start();
    setListening(true);
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      audio.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      trace(analyser);
    } else trace(null);
    void listMics();
  };

  const finish = (keepIt: boolean) => {
    keep.current = keepIt;
    const r = rec.current;
    if (r && r.state !== 'inactive') r.stop();
  };

  // The clock, once a second while listening.
  useEffect(() => {
    if (!listening) return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setSeconds(sec);
      if (sec >= VOICE_MAX_SECONDS) finish(true);
    }, 250);
    return () => window.clearInterval(id);
  }, [listening]);

  // Leaving the page (or the project) while listening throws the words away rather than typing
  // them into a box the person can no longer see.
  useEffect(() => () => { keep.current = false; if (rec.current?.state === 'recording') rec.current.stop(); release(); }, []);

  useEffect(() => {
    if (!listening) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [listening]);

  if (!supported) return null;

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled || writing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.clientX, at: Date.now(), was: listening, id: e.pointerId };
    if (!listening) void begin();
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    // Slide toward the reading start to cancel. In a right-to-left page that is to the right.
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const dx = (e.clientX - p.x) * (rtl ? -1 : 1);
    setSlide(Math.max(-CANCEL_PX * 1.3, Math.min(0, dx)));
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    if (slide <= -CANCEL_PX) finish(false);
    else if (p.was) finish(true);
    else if (Date.now() - p.at > HOLD_MS) finish(true);
    // else: a tap — keep listening until the next tap.
    setSlide(0);
  };
  // The keyboard's press: Enter and Space arrive as a click with no pointer (detail 0).
  const click = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0 || disabled || writing) return;
    if (listening) finish(true); else void begin();
  };

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const cancelling = slide <= -CANCEL_PX;

  return (
    <>
      {(listening || writing) && (
        <p className="pk-transcript" aria-live="polite">
          <span className="pk-transcript__tail">{writing ? 'Writing down what you said…' : 'Listening… tap the button again when you are done.'}</span>
        </p>
      )}
      <span className="pk-voice-slot">
        <button
          type="button"
          className={`pk-voice${listening ? ' is-listening' : ''}${cancelling ? ' is-cancelling' : ''}`}
          style={{ ['--pk-slide' as string]: `${slide}px` }}
          aria-label={listening ? 'Stop and keep what you said' : 'Talk instead of typing'}
          aria-pressed={listening}
          aria-busy={writing || undefined}
          data-tip={listening ? undefined : 'Tap to talk. Hold to talk, slide left to cancel.'}
          data-dock=""
          disabled={(disabled && !listening) || writing}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { press.current = null; setSlide(0); }}
          onClick={click}
        >
          <span className="pk-voice__cap" aria-hidden="true" />
          <canvas ref={canvas} className="pk-voice__wave" aria-hidden="true" />
          <span className="pk-voice__cancel" aria-hidden="true">‹ Cancel</span>
          <span className="pk-voice__clock" aria-hidden="true">{clock}</span>
          <span className="pk-voice__glyph" aria-hidden="true">
            {listening ? <span className="pk-voice__stop" /> : <Icon d={PATH.mic} size={16} />}
          </span>
        </button>
        {mics.length > 1 && (
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger className="pk-voice__pick" size="icon-sm" aria-label="Choose a microphone">
              <Icon d={PATH.chevronDown} size={11} />
            </PromptInputActionMenuTrigger>
            <PromptInputActionMenuContent aria-label="Microphone" side="top" className="gx-menu">
              <DropdownMenuLabel className="gx-menu__section">Microphone</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={mic || (mics[0]?.deviceId ?? '')}
                onValueChange={(id) => { setMic(id); writeMic(id); }}
              >
                {mics.map((d) => (
                  <DropdownMenuRadioItem key={d.deviceId} value={d.deviceId} className="gx-menu__item">
                    <span className="gx-menu__main"><span className="gx-menu__name">{d.label}</span></span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
        )}
      </span>
    </>
  );
}
