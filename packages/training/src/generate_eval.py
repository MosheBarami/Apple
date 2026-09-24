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
import json
import pathlib
import sys
import time

from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler


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

    results = {r["id"]: {"family": r["family"], "kind": r["kind"], "reference": r["reference"]} for r in rows}

    sides = [("base", None), ("adapter", args.adapter)]
    if args.best_adapter:
        sides.append(("best", args.best_adapter))
    for label, adapter in sides:
        started = time.time()
        print(f"loading {label}...", file=sys.stderr)
        model, tokenizer = load(args.model, adapter_path=adapter)
        for i, row in enumerate(rows, 1):
            out = answer(model, tokenizer, row["messages"], args.max_tokens)
            results[row["id"]][label] = out
            print(f"  {label} {i}/{len(rows)} {row['id']}", file=sys.stderr)
        print(f"{label} done in {time.time() - started:.0f}s", file=sys.stderr)
        del model, tokenizer

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report = {"model": args.model, "adapter": args.adapter, "rows": results}
    if args.best_adapter:
        report["best_adapter"] = args.best_adapter
    out_path.write_text(json.dumps(report, indent=1))
    print(f"wrote {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
