"""Generate held-out answers from the base model and from base+adapter, for scoring elsewhere.

WHY BOTH, ALWAYS, IN ONE RUN. A number from the adapter alone says nothing. The question w22 asks
is whether training helped, and the only thing that answers it is the same prompts, the same
decoding settings and the same harness, run against both. The apple-v3 adapter was WORSE than its
base at the product's job, and nobody would have known from a score.

This script only generates. Scoring lives in Node, where `checkCandidate` already extracts the
fenced block, refuses a context-dependent module and executes the example's own checks in the
sandbox — tested code that should not be reimplemented here for the sake of keeping the language
uniform.

Greedy decoding (temp 0). Sampling would make a rerun disagree with itself, and a difference
between two models has to survive being measured twice.

Usage:
    python src/generate_eval.py --adapter adapters/apple-v4 --out runs/eval-v4.json
"""
import argparse
import hashlib
import importlib.metadata
import json
import pathlib
import platform
import sys
import time

from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def input_identity(folder, names):
    return {name: file_digest(folder / name) for name in names if (folder / name).is_file()}


def local_model_path(model):
    """Resolve once, offline, so all paired sides load the same snapshot."""
    path = pathlib.Path(model)
    if path.is_dir():
        return path.resolve()
    from huggingface_hub import snapshot_download
    # Match the installed MLX loader's model/tokenizer scope: the usable cache
    # intentionally omits unrelated repository README/.gitattributes files.
    patterns = ["*.json", "model*.safetensors", "*.py", "tokenizer.model",
                "*.tiktoken", "tiktoken.model", "*.txt", "*.jsonl", "*.jinja"]
    return pathlib.Path(snapshot_download(model, local_files_only=True, allow_patterns=patterns)).resolve()


def provenance(args, model_path):
    try:
        import mlx.core as mx
        device = str(mx.default_device())
    except ImportError:
        device = None  # isolated fake generator tests have no MLX runtime
    versions = {}
    for package in ("mlx", "mlx-lm", "transformers", "tokenizers", "huggingface-hub"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = None
    adapters = {}
    for side, value in (("adapter", args.adapter), ("best", args.best_adapter)):
        if value:
            adapters[side] = input_identity(pathlib.Path(value), ("adapter_config.json", "adapters.safetensors"))
    return {
        "schema": 1, "python": platform.python_version(), "platform": platform.platform(),
        "runtimeDevice": device,
        "packages": versions, "dataSha256": file_digest(pathlib.Path(args.data)),
        "generatorSha256": file_digest(pathlib.Path(__file__)),
        "modelSnapshot": model_path.name if model_path.parent.name == "snapshots" else None,
        "modelFiles": input_identity(model_path, ("config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json",
                                                  "special_tokens_map.json", "chat_template.jinja", "model.safetensors.index.json")),
        "weightFiles": {p.name: {"bytes": p.stat().st_size} for p in sorted(model_path.glob("model*.safetensors"))},
        "adapterFiles": adapters, "decoding": {"temperature": 0.0, "maxTokens": args.max_tokens},
        "baseWeightHashesVerified": False,
    }


def prompts_from(path: pathlib.Path):
    """Every held-out row, as (id, kind, chat-prefix-up-to-the-answer, expected-marker)."""
    rows = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        meta = row.get("meta") or {}
        messages = row["messages"]
        # The label is the final assistant turn; the prompt is everything before it.
        if not messages or messages[-1].get("role") != "assistant":
            continue
        rows.append(
            {
                "id": meta.get("id") or f"row{len(rows)}",
                "family": meta.get("family"),
                "kind": meta.get("kind") or "game-logic",
                "messages": messages[:-1],
                "reference": messages[-1],
            }
        )
    return rows


def answer(model, tokenizer, messages, max_tokens):
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    sampler = make_sampler(temp=0.0)
    return generate(model, tokenizer, prompt=text, max_tokens=max_tokens, sampler=sampler, verbose=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="unsloth/Llama-3.2-3B-Instruct")
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--best-adapter", default=None,
                    help="Generate the current best in this same process for a paired comparison")
    ap.add_argument("--data", default="mlxdata-apple-v4/test.jsonl")
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-tokens", type=int, default=600)
    args = ap.parse_args()

    rows = prompts_from(pathlib.Path(args.data))
    if not rows:
        print("no held-out rows found; nothing was evaluated", file=sys.stderr)
        return 2
    print(f"held-out rows: {len(rows)}", file=sys.stderr)

    model_path = local_model_path(args.model)
    generation_provenance = provenance(args, model_path)

    results = {r["id"]: {"family": r["family"], "kind": r["kind"], "reference": r["reference"]} for r in rows}

    sides = [("base", None), ("adapter", args.adapter)]
    if args.best_adapter:
        sides.append(("best", args.best_adapter))
    for label, adapter in sides:
        started = time.time()
        print(f"loading {label}...", file=sys.stderr)
        model, tokenizer = load(str(model_path), adapter_path=adapter)
        for i, row in enumerate(rows, 1):
            out = answer(model, tokenizer, row["messages"], args.max_tokens)
            results[row["id"]][label] = out
            print(f"  {label} {i}/{len(rows)} {row['id']}", file=sys.stderr)
        print(f"{label} done in {time.time() - started:.0f}s", file=sys.stderr)
        del model, tokenizer

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report = {"model": args.model, "adapter": args.adapter, "adapterSide": "adapter", "rows": results,
              "provenance": generation_provenance}
    if args.best_adapter:
        report["best_adapter"] = args.best_adapter
    out_path.write_text(json.dumps(report, indent=1))
    print(f"wrote {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
