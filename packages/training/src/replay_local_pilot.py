"""Reload a saved local adapter in a fresh process and repeat the exact development holdout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("data", type=Path)
    args = parser.parse_args()
    target = args.run / "replay.json"
    if target.exists():
        raise ValueError("replay output exists; do not overwrite evidence")
    manifest = json.loads((args.run / "manifest.json").read_text())
    completed = json.loads((args.run / "completed.json").read_text())
    adapter = args.run / "adapter" / "adapters.safetensors"
    if hashlib.sha256(adapter.read_bytes()).hexdigest() != completed["adapterSha256"]:
        raise ValueError("saved adapter hash changed")
    raw = (args.data / "test.jsonl").read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["inputHashes"]["test.jsonl"]:
        raise ValueError("held-out input changed")
    model_path = Path(manifest["config"]["model"])
    if not model_path.is_dir():
        raise ValueError("cached local model required")
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    signal.alarm(300)
    import mlx.core as mx
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    mx.set_memory_limit(12 * 1024**3)
    mx.set_cache_limit(512 * 1024**2)
    model, tokenizer = load(str(model_path), adapter_path=str(args.run / "adapter"),
                            tokenizer_config={"trust_remote_code": False, "local_files_only": True})
    results = []
    for row in [json.loads(line) for line in raw.decode().splitlines()]:
        prompt = tokenizer.apply_chat_template(row["messages"][:-1], add_generation_prompt=True, tokenize=False)
        response = generate(model, tokenizer, prompt=prompt, max_tokens=1600, sampler=make_sampler(temp=0.0), verbose=False)
        prior = json.loads((args.run / f"after-{row['meta']['id']}.json").read_text())
        results.append({"id": row["meta"]["id"], "response": response, "matchesInMemory": response == prior["response"]})
    report = {"freshProcessReload": True, "adapterSha256": completed["adapterSha256"], "results": results,
              "productionPromotion": False, "providerSpendUsd": 0}
    with target.open("x") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"reloaded": True, "exactResponseMatches": sum(r["matchesInMemory"] for r in results), "examples": len(results)}))
    signal.alarm(0)


if __name__ == "__main__":
    main()
