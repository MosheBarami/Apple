# Hugging Face open Jev connection

The owner's Apple OS now runs the independent [Kotoba open-Jev model](https://huggingface.co/com-kotobalabs/open-jev-deberta-v3-large) locally. It is **not** TypeSafe's official Jev. The model card calls it an independent reproduction of Jev's typed-decision interface and marks it Apache-2.0, English-only, and trained on banking support, movie reviews, and Wikipedia yes/no data. Its published out-of-distribution accuracy is 0.690 on the authors' test, which is not an Apple routing score.

The Hugging Face snapshot is pinned to revision `188ee67a5c93122b916e5acd5bdb0cb3623e380a` under `~/Documents/Apple-OS/runtime/open-jev-model`. The Python runtime is in `~/Documents/Apple-OS/runtime/open-jev-venv`. Neither the 1.7 GB weights nor owner request text are stored in Git. A macOS LaunchAgent at `~/Library/LaunchAgents/com.moshe.apple-os.open-jev.plist` starts the loopback inference server on `127.0.0.1:4778`; it loads the downloaded snapshot and makes no Hub call during inference. The dashboard sends English requests to that local server and displays its proposal separately. Hebrew requests and exact local commands do not call the model. The official TypeSafe API remains an optional, separate path when a TypeSafe key is supplied.

The local model does not yet control routing. In eight exploratory Apple requests on 2026-09-25, it selected the tool-work option for every request, including questions asking for a score or summary. Its confidence ranged approximately 0.52–0.70. These probes show why the proposed tier is advisory until a held-out Apple request set demonstrates useful accuracy. A request to the model never starts a Codex agent or changes a file from the dashboard.

Verification commands:

```bash
curl -fsS http://127.0.0.1:4778/health
node --test scripts/apple-os/apple-os.test.mjs
curl -fsS http://127.0.0.1:4777/api/cc/os
```

The dashboard entry is `http://localhost:4777/#/os`. A live model call is visible by routing an English request there: the result contains a separate “הצעת open Jev” with a confidence. The service should report `hosting:local`, the pinned revision and `device:cpu` from `/health`.
