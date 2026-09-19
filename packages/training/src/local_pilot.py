"""Offline, bounded development LoRA experiment. Never deploys or promotes a model.

Uses already-cached MLX weights, verifies complete assistant targets before training,
and saves deterministic before/after responses on family-disjoint development holdouts.
Metrics stay in local Trackio. No customer data, network download or Hub publication.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import time
from types import SimpleNamespace


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def bounded_iterations(value: str) -> int:
    try:
        count = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("iterations must be an integer from 1 to 128") from error
    if not 1 <= count <= 128:
        raise argparse.ArgumentTypeError("iterations must be an integer from 1 to 128")
    return count


def validate_rows(splits, card):
    seen_ids, seen_sources, families = set(), set(), {}
    for split in ("train", "val", "test"):
        rows = splits[split]
        if not rows or len(rows) != card["splitSizes"][split]:
            raise ValueError("missing or mismatched split")
        for row in rows:
            meta, messages = row["meta"], row["messages"]
            if [m["role"] for m in messages] != ["system", "user", "assistant"]:
                raise ValueError("unexpected message structure")
            if meta["origin"] != "first-party-authored-synthetic":
                raise ValueError("only original synthetic examples allowed")
            answer = messages[-1]["content"]
            if not answer.startswith("```luau\n") or not answer.endswith("\n```"):
                raise ValueError("target must be one Luau module")
            source_hash = digest(answer[8:-4])
            evidence = meta["evidence"]
            if evidence["sourceSha256"] != source_hash or not evidence["behaviorPassed"] or not evidence["mutationRejected"]:
                raise ValueError("source differs from executed evidence")
            if meta["id"] in seen_ids or source_hash in seen_sources:
                raise ValueError("duplicate example")
            family = meta["family"]
            if card["families"].get(family) != split or families.get(family, split) != split:
                raise ValueError("semantic family leaks across splits")
            seen_ids.add(meta["id"])
            seen_sources.add(source_hash)
            families[family] = split
    if len(seen_ids) != card["examples"] or card.get("customerData") is not False:
        raise ValueError("card does not match original dataset")


def completion_tokens(tokenizer, messages):
    # Completed-chat templates can inject <think> that inference never supplies (old v1 failure).
    # Preserve the actual generation prefix and encode ONLY the audited literal answer as target.
    prompt = tokenizer.apply_chat_template(messages[:-1], add_generation_prompt=True, return_dict=False)
    target = tokenizer.encode(messages[-1]["content"], add_special_tokens=False)
    if tokenizer.decode(target) != messages[-1]["content"]:
        raise ValueError("assistant target changed during tokenization")
    if tokenizer.eos_token_id is None:
        raise ValueError("tokenizer has no end-of-turn token")
    return prompt + target + [tokenizer.eos_token_id], len(prompt)


def verify_tokens(tokenizer, splits, max_length):
    lengths = []
    for rows in splits.values():
        for row in rows:
            messages = row["messages"]
            complete, offset = completion_tokens(tokenizer, messages)
            if len(complete) > max_length or len(complete) <= offset + 1:
                raise ValueError("target would be truncated or empty")
            lengths.append(len(complete))
    return {"min": min(lengths), "max": max(lengths), "count": len(lengths)}


class LiteralDataset:
    def __init__(self, rows, tokenizer):
        self.rows, self.tokenizer = rows, tokenizer
    def __len__(self):
        return len(self.rows)
    def __getitem__(self, index):
        return self.rows[index]
    def process(self, row):
        return completion_tokens(self.tokenizer, row["messages"])


def write_json(path, body):
    with path.open("x") as stream:
        json.dump(body, stream, indent=2)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--iterations", type=bounded_iterations, default=16)
    parser.add_argument("--run", action="store_true", help="explicit opt-in to local training")
    opts = parser.parse_args()
    if not opts.run:
        parser.error("--run is required; no training started")
    if not opts.model.is_dir() or not (opts.model / "model.safetensors").is_file():
        raise ValueError("complete cached local weights are required; no downloads")
    opts.out.mkdir(parents=False, exist_ok=False)
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                      TRACKIO_DIR=str(opts.out / "trackio"), GRADIO_ANALYTICS_ENABLED="False")
    # Wall deadline includes load, all generation and checkpoints. Partial evidence remains on failure.
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError("local pilot exceeded 15 minutes")))
    signal.alarm(900)
    import numpy as np
    import mlx.core as mx
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    from mlx_lm.lora import CONFIG_DEFAULTS, train_model
    from mlx_lm.tuner.callbacks import TrainingCallback
    import trackio

    splits = {name: [json.loads(line) for line in (opts.data / f"{name}.jsonl").read_text().splitlines()]
              for name in ("train", "val", "test")}
    card = json.loads((opts.data / "dataset-card.json").read_text())
    validate_rows(splits, card)
    # Bound allocations well below this machine's32GiB; do not disable Metal safeguards.
    mx.set_memory_limit(12 * 1024**3)
    mx.set_cache_limit(512 * 1024**2)
    np.random.seed(20260918)
    mx.random.seed(20260918)
    model, tokenizer = load(str(opts.model), tokenizer_config={"trust_remote_code": False, "local_files_only": True})
    lengths = verify_tokens(tokenizer, splits, 2048)
    config = dict(CONFIG_DEFAULTS, model=str(opts.model), train=True, optimizer="adamw",
                  seed=20260918, num_layers=8, batch_size=1, iters=opts.iterations, val_batches=2,
                  learning_rate=5e-5, max_seq_length=2048, grad_checkpoint=True,
                  steps_per_report=4, steps_per_eval=8, save_every=8, mask_prompt=True,
                  adapter_path=str(opts.out / "adapter"), lora_parameters={"rank": 8, "scale": 16.0, "dropout": 0.0,
                  "keys": ["self_attn.q_proj", "self_attn.k_proj", "self_attn.v_proj", "self_attn.o_proj"]})
    write_json(opts.out / "manifest.json", {"kind": "development-pilot-not-production-max", "config": config,
               "dataDigest": card["digest"], "inputHashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
               for p in opts.data.glob("*.json*")}, "tokenLengths": lengths, "productionPromotion": False,
               "holdout": {"examples": len(splits["test"]),
                           "families": sorted(row["meta"]["family"] for row in splits["test"]),
                           "scope": "family-disjoint development split; independent status is defined by the preregistration"}})
    print("Preflight passed:", lengths, flush=True)
    trackio.init(project="apple-local-pilot", name=opts.out.name, space_id=None, dataset_id=None,
                 config={"dataset_digest": card["digest"], "iterations": opts.iterations}, auto_log_gpu=False, auto_log_cpu=False)
    class Metrics(TrainingCallback):
        def record(self, phase, info):
            values = {f"{phase}/{key}": float(value) for key, value in info.items() if isinstance(value, (int, float))}
            trackio.log(values)
            with (opts.out / "metrics.jsonl").open("a") as stream:
                stream.write(json.dumps({"phase": phase, **values}) + "\n")
        def on_train_loss_report(self, info):
            self.record("train", info)
        def on_val_loss_report(self, info):
            self.record("validation", info)
    def sample(phase):
        model.eval()
        for row in splits["test"]:
            prompt = tokenizer.apply_chat_template(row["messages"][:-1], add_generation_prompt=True, tokenize=False)
            started = time.monotonic()
            response = generate(model, tokenizer, prompt=prompt, max_tokens=1600, sampler=make_sampler(temp=0.0), verbose=False)
            write_json(opts.out / f"{phase}-{row['meta']['id']}.json", {"id": row["meta"]["id"], "phase": phase,
                       "response": response, "seconds": time.monotonic() - started})
            print(f"{phase}: {row['meta']['id']} saved", flush=True)
    try:
        sample("before")
        train_model(SimpleNamespace(**config), model,
                    LiteralDataset(splits["train"], tokenizer),
                    LiteralDataset(splits["val"], tokenizer), Metrics())
        sample("after")
        artifact = opts.out / "adapter" / "adapters.safetensors"
        write_json(opts.out / "completed.json", {"trainingCompleted": True, "adapterSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                   "adapterBytes": artifact.stat().st_size, "peakMemoryBytes": mx.get_peak_memory(),
                   "productionPromotion": False, "behaviorEvaluation": "pending separate Luau scoring", "providerSpendUsd": 0})
    finally:
        trackio.finish()
        signal.alarm(0)


if __name__ == "__main__":
    main()
