# Audio DSP hang resume — 2026-09-18

## Result

The old long-running audio DSP process does **not** reproduce on the current source. The focused
audio DSP suite completed under an external watchdog, and the exact RIFF chunk-size value that would
stall the prior bitwise walker also completed under a separate external watchdog. No matching Node
process remained after either run.

No change was made to:

- `apps/worker/src/audio.ts`
- `apps/worker/tests/audio-dsp.test.mjs`

This is intentional: the current decoder already contains the minimal repair for the confirmed hang
class, and changing it again without a current failure would replace evidence with speculation.

## Current test path

The old process was described as running `tests/audio-dsp.test.mjs` from the Worker directory. From
the repository root the current file is:

`apps/worker/tests/audio-dsp.test.mjs`

There is no `/rbxai/tests/audio-dsp.test.mjs` in the current checkout.

## Fresh focused run with an external timeout

The test was launched as a child process from an external Python watchdog. The watchdog used a new
process session, `communicate(timeout=20)`, and on timeout would `SIGKILL` the whole child process
group and then `communicate()` again to reap it. This protects against a synchronous JavaScript
infinite loop, which an in-process Node test timeout cannot interrupt.

Command under test:

```bash
node --test apps/worker/tests/audio-dsp.test.mjs
```

Observed result:

- watchdog timeout: `false`
- child return code: `0`
- Node test result: **46/46 passed**
- Node-reported suite duration: **124.933708 ms**
- a process-table check immediately after the run found no matching
  `node ... audio-dsp.test.mjs` process

No full or integrated suite was run in this lane.

## Confirmed hang mechanism

RIFF chunk sizes are unsigned 32-bit values. JavaScript bitwise operators coerce their operands to
signed 32-bit integers. The unsafe alignment expression documented by the current decoder is:

```js
(declared + 1) & ~1
```

For an attacker-controlled chunk size of `0xfffffff8`:

```text
declared     = 4294967288
oldAligned   = -8
payloadAt    = at + 8
oldNextAt    = payloadAt + oldAligned
             = at + 8 - 8
             = at
```

The chunk walker therefore makes **zero progress** and its synchronous `while` loop can run forever.
The same signed conversion class is visible with the existing hostile-size fixture
`0xffffff00`: the old aligned value is `-256`, so the walker moves backwards instead of forward.

The current implementation at `apps/worker/src/audio.ts` avoids bitwise alignment entirely:

```ts
at = payloadAt + (declared % 2 === 0 ? declared : declared + 1);
```

Because JavaScript Numbers represent every uint32 value exactly, `0xfffffff8` remains
`4294967288`; the next offset jumps beyond the real buffer and the loop terminates. The decoder
separately clamps `dataLength` to the bytes actually present before that advance, preserving the
existing behavior that a lying data chunk does not cause an out-of-bounds read.

The numeric comparison was executed directly on the current runtime:

```text
{"declared":4294967040,"oldAligned":-256,"oldNext":-212,"currentAligned":4294967040,"currentNext":4294967084,"stalls":false}
{"declared":4294967288,"oldAligned":-8,"oldNext":36,"currentAligned":4294967288,"currentNext":4294967332,"stalls":true}
```

## Exact current decoder probe for the stall value

A temporary probe bundled the current `apps/worker/src/audio.ts`, constructed a 52-byte PCM WAV
whose `data` chunk declares `0xfffffff8` bytes while only eight data bytes exist, and called
`decodeWav`. The probe itself ran under a separate external 10-second kill+wait watchdog.

Observed result:

```json
{"sampleRate":16000,"channels":1,"samples":[0.0030517578125,-0.0030517578125,0.006103515625,-0.006103515625]}
```

Watchdog result:

```text
timed_out=false
returncode=0
```

The temporary probe file and bundle were removed after execution. A process-table check afterward
found no matching audio DSP/stall Node child.

Two earlier attempts to place the temporary probe outside the Worker package failed immediately with
`ERR_MODULE_NOT_FOUND` for `esbuild`. Those attempts did not exercise `decodeWav`, did not time
out, and left no child process. Moving the temporary probe under `apps/worker` resolved package
lookup and produced the successful observation above.

## Source history and observation limit

`git status` and `git diff` show no current changes to either audio source or its DSP test.
`git blame` attributes the current chunk-walk implementation, including the arithmetic fix and its
explanation, to commit:

`e6a9348f7019516858780f863728ac952ee7694f`
(`2026-09-15T09:34:13+03:00`).

The parent of that commit does not contain `apps/worker/src/audio.ts`, so the repository history
does not preserve an earlier committed defective version of this file. The already-terminated old
PID also cannot now be stack-sampled. Therefore this report does not claim the exact instruction
pointer of that terminated process.

What is directly established is:

1. the current source explicitly documents the prior bitwise RIFF-size failure mode;
2. the current test contains hostile declared-size and zero-length progress fixtures aimed at the
   chunk walker;
3. the signed-int32 arithmetic above has an exact no-progress input (`0xfffffff8`);
4. the current decoder handles that exact input and the full current DSP suite without hanging under
   external process supervision.

Together, those observations identify the old WAV chunk-size alignment as the concrete hang class
while showing that no additional audio source repair is needed in the present checkout.

## Fingerprints

Repository HEAD during this validation:

`6d7a5bec3a741de9cbe97459bcc82e760bd3e089`

| File | SHA-256 |
|---|---|
| `apps/worker/src/audio.ts` | `65be41c82035fafe72ace3721ce6c8179139edf25704f78c12e2f29d28b63982` |
| `apps/worker/tests/audio-dsp.test.mjs` | `cc58bd4831f8f5048f7a460eac0fbd23666120be923ac93862145029053ede45` |
