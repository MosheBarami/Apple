---
name: sound-design
description: Sound and music in Roblox. Covers the Sound object (SoundId, Volume, PlaybackSpeed, Looped, TimePosition, RollOffMode and Min/Max distance), 3D positional vs UI/2D sounds, SoundService and SoundGroups with effects (Reverb, Equalizer, Compressor), the newer AudioPlayer/AudioEmitter/AudioListener/Wire API, finding licensed audio with search_creator_store (category audio), music layering and transitions, triggering sounds from scripts without spam, and verifying with play_check and logs. Load before adding or changing any sound, music or audio system.
---

# Sound design

Sound confirms actions (feedback), places the player (ambience) and sets mood (music). Every sound needs a reason, a
source location (3D or not), a mix level relative to others, and a trigger that cannot spam.

## 1. Plan the sound layer

List what the request needs in three buckets:
- **Feedback** (UI clicks, pickups, hits, purchases, errors): short (0.05-1 s), immediate, never looped.
- **World / ambience** (wind, water, machines, birds, crowds): looped, positional or zone-based, quiet.
- **Music**: looped tracks per zone/state (lobby, round, victory), crossfaded.
Give each bucket a `SoundGroup` so the mix (and a player volume setting) is controlled in one place.

## 2. The Sound object

| Property | Notes |
|---|---|
| `SoundId` | `"rbxassetid://<id>"` from the store search, or from `generate_sound` with `upload: true` (an original effect from its catalogue, uploaded to the person's own account). Never invent ids. |
| `Volume` | 0-10, default 0.5. Most sounds sit 0.2-1; reserve > 1 for rare loud events. |
| `PlaybackSpeed` | 1 = normal; also shifts pitch. Randomise 0.9-1.1 on repeated sounds (footsteps, hits) to avoid fatigue. (`Pitch` is deprecated.) |
| `Looped` | for ambience/music. |
| `TimePosition` | seek (seconds); `TimeLength` is known after `IsLoaded`/`Loaded`. |
| `PlaybackRegionsEnabled`, `PlaybackRegion`, `LoopRegion` | play or loop a slice of a longer file. |
| `RollOffMode` | `Inverse` (realistic, default), `Linear`, `LinearSquare`, `InverseTapered` — how volume falls with distance. Linear modes reach silence exactly at the max distance (predictable for gameplay). |
| `RollOffMinDistance` / `RollOffMaxDistance` | full volume inside Min; inaudible past Max (Linear) — default 10 / 10000 studs. A campfire: ~10 / 60. A waterfall: ~20 / 150. |
| `SoundGroup` | the group it mixes into. |
| `PlayOnRemove` | plays when destroyed (one-shot from a part being removed). |
| Methods / events | `Play()`, `Stop()`, `Pause()`, `Resume()`; `Ended`, `Loaded`, `DidLoop`, `Played`. |

**3D vs 2D:**
- Parent a Sound to a `BasePart` or `Attachment` → positional (panned and attenuated by distance from the listener).
- Parent to `SoundService`, a GUI, or the player's PlayerGui/camera → non-positional (UI, music).
- `SoundService:PlayLocalSound(sound)` plays a sound for the local client only (UI feedback, no replication).

## 3. SoundService, SoundGroups, effects

- Create `SoundGroup`s under `SoundService` (e.g. Music, SFX, Ambience, UI); set each Sound's `SoundGroup`. Group
  `Volume` scales all members — wire a settings slider to it.
- Effects are `SoundEffect` subclasses parented to a Sound or SoundGroup (`Priority` orders a chain):
  - `ReverbSoundEffect` (`DecayTime`, `Density`, `Diffusion`, `DryLevel`, `WetLevel`) — caves, halls, bathrooms.
    Or set `SoundService.AmbientReverb` (Enum.ReverbType) for a global space.
  - `EqualizerSoundEffect` (`LowGain`, `MidGain`, `HighGain`, dB) — muffle (cut highs) underwater/behind walls,
    thin out radio voices (cut lows).
  - `CompressorSoundEffect` (`Threshold`, `Ratio`, `Attack`, `Release`, `GainMakeup`, `SideChain`) — even out music;
    side-chain to duck music under dialogue/SFX.
  - Also `ChorusSoundEffect`, `DistortionSoundEffect`, `EchoSoundEffect`, `FlangeSoundEffect`,
    `PitchShiftSoundEffect`, `TremoloSoundEffect`.
- Zone ambience: toggle effects/reverb when the player enters a zone (client, region check on Heartbeat or tagged
  zone parts with `GetPartBoundsInBox`).

## 4. The newer audio API (AudioPlayer graph)

A graph of instances connected by `Wire` (`SourceInstance` → `TargetInstance`):
- `AudioPlayer` (`Asset` = "rbxassetid://<id>", `Volume`, `PlaybackSpeed`, `Looping`, `TimePosition`, `AutoPlay`,
  `IsReady`, `Play()`, `Stop()`, `Ended`) produces audio.
- `AudioEmitter` (in a part/attachment) makes it positional; distance curve via `SetDistanceAttenuation({ [distance] =
  volume })` (the property itself is not scriptable).
- `AudioListener` (usually on the camera or character) hears emitters; `SoundService.DefaultListenerLocation` creates
  one for you. `AudioDeviceOutput` sends a stream to the speakers (for non-positional audio: AudioPlayer → Wire →
  AudioDeviceOutput).
- Processing nodes (`AudioFader`, `AudioEqualizer`, `AudioReverb`, `AudioCompressor`, ...) sit between them on wires.
Use it when you need routing (voice chat processing, per-zone mixes, analysis); for ordinary game sounds the `Sound`
object is simpler. Do not mix both styles for the same purpose. `search_docs` "audio API" before using it — it is newer
and changes faster.

## 5. Finding audio

- `search_creator_store` with `category: "audio"` and short descriptive queries: sound effects by action and
  material ("wood door creak", "coin pickup", "sword swing whoosh", "footstep grass"), music by genre + mood + use
  ("calm lofi loop", "epic orchestral battle loop", "8-bit victory jingle").
- Prefer results from Roblox's own licensed library/verified creators. Audio must be public (or owned by the
  experience owner) to play in a live game; private audio silently fails (check logs).
- Check duration fits the use: feedback ≤ 1-2 s; loops should loop cleanly (listen for a gap: `play_check` cannot
  hear, so mention the risk to the user and prefer results described as "loop").
- Never invent ids; never take ids from free-model scripts.

## 6. Music layering and transitions

- One music Sound per state/zone; only one plays at a time. Crossfade with TweenService on `Volume` over 1-3 s
  (fade out old, start new at 0, fade in).
- Stingers (short victory/defeat jingles) duck the music (lower Music group volume briefly) then restore.
- Layered/adaptive: two synchronised loops (base + intensity layer) started together, fade the intensity layer by
  game state.
- Music normally plays on the client (each player can have their own zone track); start it from a LocalScript.

## 7. Triggering from scripts

- **Who plays it**: a sound played by a server script on a part in Workspace is heard by everyone; UI and personal
  feedback is played on the client (LocalScript, or `SoundService:PlayLocalSound`). For a server event that everyone
  should hear at a place, play a Sound in a part there.
- **Reuse, don't clone per play** for frequent sounds: keep one Sound per source and call `Play()` (restarts it). For
  overlapping one-shots (rapid hits), clone a template into the part, `Play()`, destroy on `Ended`.
- **Anti-spam**: per-source cooldown (`os.clock()` difference ≥ 0.05-0.2 s), cap concurrent instances of the same
  sound, debounce `Touched`. Server-triggered sounds must not be driven directly by client remotes without a
  cooldown.
- Preload important sounds with `ContentProvider:PreloadAsync({sound})` on the client so the first play is not late.

## 8. Mix guidelines

- Feedback must be audible over music: music ~0.2-0.4, ambience ~0.1-0.3, SFX 0.5-1.
- Vary repeated sounds (pitch ±10%, 2-3 variants).
- Avoid many simultaneous looped 3D sounds; each costs CPU. Stop sounds outside their area.

## 9. Verification

- `read_instance` each Sound: `SoundId` set, `SoundGroup` set, parent correct (part for 3D).
- `play_check` and `get_output_logs`: look for `Failed to load sound rbxassetid://...` (wrong id / private / moderated)
  and script errors on trigger. Fix by choosing another asset.
- Tell the user which ids you used and that sound quality needs their ears in a real playtest.
