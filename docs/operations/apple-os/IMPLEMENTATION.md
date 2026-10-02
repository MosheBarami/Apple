# Apple OS implementation ledger

The owner asked for the system primarily for Apple and for it to live in the currently running dashboard at `http://localhost:4777/`.

| Capability from the video | Current implementation | Next proof |
|---|---|---|
| Visual owner interface | Apple HQ page `#/os` with real acceptance, training, skills and brief data | Opened live on port 4777; generated a new brief and tested route/search from the visible page |
| File-based memory | Private Markdown vault at `~/Documents/Apple-OS`: raw, wiki, outputs and a schema | Idempotent initialization and source-line search tested; time-coded video transcript retained privately |
| Skill backbone | A catalog with ready/planned state, a Codex skill and aggregate 30-day task-pattern mining | Brief executed from CLI and dashboard; 64 relevant sessions/263 user request items counted without copying private chat text; Studio and review skills remain planned |
| Automation | Manual brief works; an active Apple OS heartbeat prepares a local brief every day at 09:00 in the app's Israel local time | Check the first scheduled run and its saved output; notify only on meaningful change or failure |
| Three-tier router | Exact no-model commands execute local reads; conservative rules classify other requests. The Hugging Face independent open-Jev model runs locally for advisory English classifications; optional official TypeSafe Jev remains separate | Live local inference observed on a pinned HF snapshot; English Apple probes exposed a tool-work bias, so the model does not control routing. See [HF-OPEN-JEV.md](HF-OPEN-JEV.md) |
| Local voice | Whisper local transcription; Kokoro English voice in an isolated local runtime, with macOS speech for Hebrew | Supplied audio transcribed with local Whisper; Kokoro generated a real short WAV; UI microphone is still pending |
| Obsidian | Vault is compatible Markdown; app/plugin not installed | Open the vault in Obsidian if the owner wants that editor; dashboard remains primary |
| Headless agent buttons | Only a bounded deterministic brief button is enabled | Add isolated, allowlisted Codex work and visible run records before exposing implementation buttons |
| Team/client package | None; this is currently owner-only | Decide whether sharing is needed after the private workflow works |

Apple's product acceptance and the local LoRA loop remain separate. No OS page metric may turn an unverified Studio build or an unpromoted local adapter into a passing product claim.
