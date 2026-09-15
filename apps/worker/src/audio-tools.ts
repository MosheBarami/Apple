// The audio tool contracts: four tools, and what each one is careful NOT to promise.
//
// These live in their own file rather than inside tools.ts because the descriptions below are the
// product surface for everything in this cluster — they are what the model reads, and they are
// where the limits of the feature have to be stated in words the model will act on. tools.ts
// registers each of the four as a LITERAL entry that delegates here; it may not spread this object
// in, and the note at that registration says why — three separate guards read tools.ts's object
// literal out of the source to hold every tool to a UI label, a phase and a mode, and a spread is
// invisible to all three.
//
// THE PROMISE EVERY ONE OF THEM REFUSES TO MAKE. Nothing in this worker uploads audio to Roblox.
// Roblox audio must be uploaded and moderated under an account before a `Sound` can reference it,
// and no path here does that, so a generated effect is something the user can HEAR and DOWNLOAD
// and not something that is in their game. `generate_image` is careful to say the same thing about
// pixels; the failure mode when it is not said is worse for audio, because a Sound with a SoundId
// that does not resolve plays silently rather than erroring — the user would be told the sound is
// placed, would hear nothing, and nothing anywhere would report a fault.
//
// SO THE CLUSTER SPLITS IN TWO, and the split is visible in the tool list:
//   design_sound / assign_sounds  — change the place. Configuration only: reverb, buses, falloff.
//                                   Asset-free by construction, so they cannot fail a licence or
//                                   moderation gate and cannot reference something that is not there.
//   generate_sound / speak_line   — make audio. It reaches the USER, not the place.
import type { AgentCtx } from './tools';
import type { GatewayToolDef, StudioOp } from '@golem/shared';
import { encodePng, bytesToBase64 } from './png';
import { encodeWav, isAudioFault, waveformPeaks, waveformPixels, type PcmAudio } from './audio';
import { SFX, SFX_NAMES, renderSfx, sfxCatalogue } from './sfx';
import {
  ENVIRONMENT_NAMES,
  BUS_NAMES,
  ROLLOFF_MODES,
  assignSoundsLuau,
  environmentCatalogue,
  isRefusal,
  refuseSoundId,
  soundDesignLuau,
  type BusName,
  type RollOffMode,
  type SoundAssignment,
} from './sound-design';
import { VOICE_PRESET_NAMES, synthesize, voicePresetCatalogue, workersAiSpeech, TIMBRE_SELECTABLE } from './speech';
import { audioPathFor, storeAudio } from './audio-store';

/**
 * Structurally identical to tools.ts's private `ToolImpl`, declared here so this file does not
 * import a value from tools.ts. tools.ts imports AUDIO_TOOLS; the only thing coming back the other
 * way is `AgentCtx`, as a TYPE, which erases at compile time. A value import in both directions
 * would be a genuine module cycle.
 */
interface AudioToolImpl {
  def: GatewayToolDef;
  studio: boolean;
  run(ctx: AgentCtx, args: Record<string, unknown>): Promise<unknown>;
}

/** JSON Schema helper, matching the one tools.ts uses for every other tool. */
const S = (props: Record<string, unknown>, required: string[] = []): unknown => ({
  type: 'object',
  properties: props,
  required,
});

async function studioOp(ctx: AgentCtx, op: StudioOp, timeoutMs = 30_000): Promise<unknown> {
  const res = await ctx.execStudioOp(op, timeoutMs);
  if (!res.ok) return { error: res.error ?? 'operation failed' };
  return res.data ?? { ok: true };
}

const failed = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && 'error' in (result as Record<string, unknown>);

/** A number that came out of a tool call, or the fallback. JSON gives us strings and nulls. */
function numArg(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------------------------

/**
 * Put an audio clip in front of the user, with its waveform drawn.
 *
 * THE WAVEFORM IS A PNG AND NOT AN SVG, and that is a constraint rather than a preference: the
 * generative-UI validator (apps/web/src/lib/generative-ui/validate.ts, `isSafeImageSrc`) admits a
 * base64 data URL of a RASTER image or the app's own image route, and refuses SVG deliberately. A
 * waveform delivered as SVG would be dropped by the validator and the panel would render with no
 * preview — a feature that exists in the worker and is invisible in the product.
 *
 * The AUDIO itself is referenced by PATH, never inlined. A ten-second WAV is ~430,000 base64
 * characters, which is far past the UI payload cap; the bytes go to KV and the panel points at the
 * route that serves them, exactly as generated images do.
 */
async function audioPanel(
  projectId: string,
  audioId: string,
  name: string,
  audio: PcmAudio | null,
  note: string,
): Promise<{ v: 1; blocks: unknown[] }> {
  let thumbnail: Record<string, unknown> | undefined;
  if (audio) {
    const peaks = waveformPeaks(audio, 320);
    if (!isAudioFault(peaks)) {
      const pixels = waveformPixels(peaks, { width: 320, height: 64 });
      if (!isAudioFault(pixels)) {
        const png = await encodePng(pixels.rgb, pixels.width, pixels.height);
        thumbnail = {
          src: `data:image/png;base64,${bytesToBase64(png)}`,
          alt: `waveform of ${name}`,
          width: pixels.width,
          height: pixels.height,
        };
      }
    }
  }
  return {
    v: 1,
    blocks: [
      {
        type: 'asset_picker',
        title: 'Generated audio',
        assets: [
          {
            id: audioId,
            name: name.slice(0, 80),
            kind: 'sound',
            ...(thumbnail ? { thumbnail } : {}),
            note,
            link: { href: audioPathFor(projectId, audioId), label: 'Listen' },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------------------------

export const AUDIO_TOOLS: Record<string, AudioToolImpl> = {
  design_sound: {
    def: {
      name: 'design_sound',
      description:
        'Give the place its acoustics and a working mixer: environment reverb, how fast sound falls away with distance, and five SoundGroups (Music, Ambience, SFX, UI, Voice) with sensible starting volumes and bus compression. This references NO assets — it is pure engine configuration, so it costs nothing and cannot fail a licence or moderation gate. Run it once per place, early; re-running retunes rather than duplicating. It does not add any audio: a place configured by this and containing no Sound instances is a very well-designed silence. Roblox\'s default sound falloff is 10 to 10,000 studs, which is why so many places sound like everything is happening next to the player\'s head — this is the fix for that.\n\nEnvironments:\n' +
        environmentCatalogue().map((e) => `  ${e.name} — ${e.summary} ${e.use}`).join('\n'),
      parameters: S(
        {
          environment: { type: 'string', enum: ENVIRONMENT_NAMES, description: 'Which acoustic environment the place is in.' },
          effects: { type: 'boolean', description: 'Attach the bus compressor and EQ. Default true.' },
          masterTrimDb: { type: 'number', description: 'Trim every bus by this many dB. -60 to +12, default 0.' },
        },
        ['environment'],
      ),
    },
    studio: true,
    run: async (ctx, a) => {
      const chunk = soundDesignLuau(String(a.environment ?? ''), {
        effects: a.effects === undefined ? true : a.effects !== false,
        masterTrimDb: numArg(a.masterTrimDb, 0),
      });
      if (isRefusal(chunk)) return { error: chunk.message, reason: chunk.reason, offending: chunk.offending };
      const res = await studioOp(ctx, { op: 'run_code', code: chunk, timeoutMs: 10_000 }, 25_000);
      if (failed(res)) return res;
      return {
        environment: a.environment,
        buses: BUS_NAMES,
        note: 'Reverb, falloff and the bus mixer are set. No audio was added — assign existing Sounds to the buses with assign_sounds, and remember that nothing here uploads audio to Roblox.',
      };
    },
  },

  assign_sounds: {
    def: {
      name: 'assign_sounds',
      description:
        'Route Sound instances that ALREADY EXIST in the place onto the mixer buses and give them a believable 3D falloff. Roblox\'s defaults (audible from 10 to 10,000 studs) are why un-configured audio sounds like it is happening inside the player\'s head. The volume change is a TRIM in dB recorded against the Sound\'s original volume, so running this twice does not compound. It never writes a SoundId: this worker cannot upload audio to Roblox and will not guess an asset id, because an id that does not resolve plays silently instead of erroring — the place would sound broken and nothing would report it. Sounds that are not there come back in `missing` rather than being counted as done. Run design_sound first, or the buses will not exist yet.',
      parameters: S(
        {
          assignments: {
            type: 'array',
            description: 'One entry per Sound.',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Full path of an existing Sound, e.g. game.Workspace.Forge.Crackle' },
                bus: { type: 'string', enum: BUS_NAMES, description: 'Which mixer bus it belongs on.' },
                volumeDb: { type: 'number', description: 'Trim in dB against the Sound\'s original volume. -60 to +12.' },
                rollOffMode: { type: 'string', enum: ROLLOFF_MODES, description: 'Default InverseTapered, which is the most natural.' },
                minDistance: { type: 'number', description: 'Studs of full volume before attenuation starts. Default 10.' },
                maxDistance: { type: 'number', description: 'Studs at which it is inaudible. Default 120. Must exceed minDistance.' },
                looped: { type: 'boolean' },
              },
              required: ['path', 'bus'],
            },
          },
        },
        ['assignments'],
      ),
    },
    studio: true,
    run: async (ctx, a) => {
      const raw = Array.isArray(a.assignments) ? a.assignments : [];
      const assignments: SoundAssignment[] = raw.slice(0, 200).map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          path: String(e.path ?? ''),
          bus: e.bus as BusName,
          ...(e.volumeDb !== undefined ? { volumeDb: numArg(e.volumeDb, 0) } : {}),
          ...(e.rollOffMode !== undefined ? { rollOffMode: e.rollOffMode as RollOffMode } : {}),
          ...(e.minDistance !== undefined ? { minDistance: numArg(e.minDistance, 10) } : {}),
          ...(e.maxDistance !== undefined ? { maxDistance: numArg(e.maxDistance, 120) } : {}),
          ...(e.looped !== undefined ? { looped: e.looped === true } : {}),
        };
      });
      const chunk = assignSoundsLuau(assignments);
      if (isRefusal(chunk)) return { error: chunk.message, reason: chunk.reason, offending: chunk.offending };
      const res = await studioOp(ctx, { op: 'run_code', code: chunk, timeoutMs: 15_000 }, 30_000);
      if (failed(res)) return res;
      // The count AND the misses are passed straight through. A pass that routed three of eight
      // Sounds and reported success is the substitution this repository exists to refuse.
      return res;
    },
  },

  generate_sound: {
    def: {
      name: 'generate_sound',
      description:
        'Synthesise an original sound effect — footsteps by surface, UI clicks and chimes, combat impacts and whooshes, or a seamlessly looping ambience bed. These are SYNTHESISED from oscillators and filtered noise, not fetched and not produced by a model: they cost nothing, are original work, and are reproducible from a seed, so asking again with the same seed returns the same take. There is NO text-to-audio here — it plays recipes from the catalogue below, not descriptions, so a request for "the sound of a dragon eating a bell" is refused rather than approximated. The result is played to the user in the workspace and stays downloadable for an hour. IT IS NOT IN THEIR GAME: nothing in this product uploads audio to Roblox, so never tell the user the sound has been placed — they can hear it, and they must upload it themselves before a Sound can use it.\n\nCatalogue:\n' +
        sfxCatalogue().map((s) => `  ${s.name} (${s.family}${s.loop ? ', loops' : ''}) — ${s.summary} ${s.use}`).join('\n'),
      parameters: S(
        {
          preset: { type: 'string', enum: SFX_NAMES, description: 'Which effect to render.' },
          seed: { type: 'number', description: 'Same seed, same bytes. Default 0. Change it for a different take of the same effect.' },
          semitones: { type: 'number', description: 'Transpose, -24 to +24. A quick way to make a heavier or lighter version of the same effect.' },
          seconds: { type: 'number', description: 'Override the preset length. Ambience beds default to 6s and loop.' },
        },
        ['preset'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      // Checked BEFORE the work, not after. `generate_image` does this the other way round and
      // says so in a note calling it worth a follow-up: it generates, pays, and only then notices
      // there is nowhere to put the result. Nothing here costs neurons, but the ordering is the
      // point and the cost of getting it right is one line.
      if (!ctx.projectId) return { error: 'generate_sound needs a project to store the result against' };

      const rendered = renderSfx({
        preset: String(a.preset ?? ''),
        seed: a.seed === undefined ? 0 : numArg(a.seed, 0),
        ...(a.semitones !== undefined ? { semitones: numArg(a.semitones, 0) } : {}),
        ...(a.seconds !== undefined ? { seconds: numArg(a.seconds, 0) } : {}),
      });
      if (isAudioFault(rendered)) return { error: rendered.detail, reason: rendered.code };

      const wav = encodeWav(rendered.audio, 16);
      if (isAudioFault(wav)) return { error: wav.detail, reason: wav.code };

      const audioId = await storeAudio(ctx.env, bytesToBase64(wav), ctx.projectId, 'audio/wav', rendered.seconds);
      if (!audioId) return { error: 'the generated audio could not be stored' };

      const preset = SFX[rendered.preset]!;
      ctx.uiDetail = await audioPanel(
        ctx.projectId,
        audioId,
        rendered.preset,
        rendered.audio,
        `${preset.summary} ${rendered.seconds.toFixed(2)}s, ${rendered.sampleRate} Hz${rendered.loop ? ', loops seamlessly' : ''}. Download it and upload it to Roblox yourself — this does not place it in your game.`,
      );

      return {
        audioId,
        preset: rendered.preset,
        family: rendered.family,
        seconds: rendered.seconds,
        sampleRate: rendered.sampleRate,
        loop: rendered.loop,
        seed: rendered.seed,
        semitones: rendered.semitones,
        peakDbfs: rendered.peakDbfs,
        bytes: wav.byteLength,
        placedInGame: false,
        note: 'The user can hear and download this. It is NOT in their Roblox place — audio has to be uploaded and moderated under their own account first, and nothing here does that.',
      };
    },
  },

  speak_line: {
    def: {
      name: 'speak_line',
      description:
        'Speak one line of dialogue or narration aloud. Use it for an NPC line, a tutorial voice-over or an announcement — one line per call, not a whole script. The preset selects the LANGUAGE and the pacing of the delivery; it does NOT select a voice, because the speech engine available here exposes no voice, gender or emotion control, and the result says so rather than implying a choice was made. The text must already be in the target language: a preset does not translate. As with generated sound effects, the audio is played to the user and is NOT in their game.\n\nPresets:\n' +
        voicePresetCatalogue().map((p) => `  ${p.name} (${p.lang}) — ${p.summary} ${p.use}`).join('\n'),
      parameters: S(
        {
          text: { type: 'string', description: 'The line to speak, already in the target language. One line, up to 1000 characters.' },
          preset: { type: 'string', enum: VOICE_PRESET_NAMES, description: 'Delivery and language. Default narrator.' },
          lang: { type: 'string', description: 'Override the preset language, e.g. "es". The TEXT must match it.' },
        },
        ['text'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      // BEFORE the call, because this one spends. A project that does not exist cannot hold the
      // result, so generating it would be paying for something nobody can ever retrieve.
      if (!ctx.projectId) return { error: 'speak_line needs a project to store the result against' };

      // An asset id in the text is a sign the caller thinks this places audio in the game. Saying
      // so costs nothing and heads off a line of dialogue that reads out a number.
      const asAsset = refuseSoundId(String(a.text ?? ''));
      if (asAsset) return { error: asAsset.message, reason: asAsset.reason };

      const spoken = await synthesize(ctx.env, workersAiSpeech(ctx.env), {
        text: String(a.text ?? ''),
        ...(a.preset !== undefined ? { preset: String(a.preset) } : {}),
        ...(a.lang !== undefined ? { lang: String(a.lang) } : {}),
      });
      if (!spoken.ok) return { error: spoken.detail, reason: spoken.code };

      const audioId = await storeAudio(ctx.env, spoken.audioBase64, ctx.projectId, spoken.contentType, spoken.seconds ?? undefined);
      if (!audioId) return { error: 'the spoken line could not be stored' };

      // No waveform: the bytes are MP3, and this worker reads MP3 frame HEADERS for a duration but
      // does not decode the audio. Drawing a waveform would mean inventing one.
      ctx.uiDetail = await audioPanel(
        ctx.projectId,
        audioId,
        spoken.spokenText.slice(0, 60),
        null,
        `${spoken.preset}, ${spoken.lang}${spoken.seconds === null ? '' : `, ${spoken.seconds.toFixed(1)}s`}. Download it and upload it to Roblox yourself — this does not place it in your game.`,
      );

      return {
        audioId,
        preset: spoken.preset,
        lang: spoken.lang,
        seconds: spoken.seconds,
        measured: spoken.measured,
        spokenText: spoken.spokenText,
        // Reported, and false. A field claiming a voice was chosen on an engine that has none would
        // be describing an intention nobody acted on.
        voiceSelected: TIMBRE_SELECTABLE,
        bytes: spoken.bytes,
        placedInGame: false,
        note: 'The user can hear and download this. It is NOT in their Roblox place, and the engine here has no voice selection — the preset chose the language and the pacing.',
      };
    },
  },
};

export const AUDIO_TOOL_NAMES = Object.keys(AUDIO_TOOLS);
