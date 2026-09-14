"""Convert an MLX LoRA adapter into the PEFT layout Cloudflare Workers AI accepts.

WHY THIS EXISTS. Training happens locally in MLX, because that is what runs on an M2 Pro. Serving
happens on Workers AI, which takes a custom adapter as exactly two files — `adapter_config.json` and
`adapter_model.safetensors` — in PEFT's layout. The two formats disagree in three ways at once, and
every one of them is silent: a wrong key is ignored, and a wrongly-oriented matrix still multiplies.

    MLX    model.layers.20.self_attn.q_proj.lora_a        [in_features, rank]
    PEFT   base_model.model.model.layers.20.self_attn.q_proj.lora_A.weight   [rank, in_features]

    1. PEFT prefixes every key with `base_model.model.`
    2. `lora_a`/`lora_b` become `lora_A.weight`/`lora_B.weight` — case matters
    3. Both matrices are TRANSPOSED

The third is the dangerous one. MLX computes `scale * (x @ lora_a @ lora_b)`; PEFT computes
`(lora_alpha / r) * (x @ lora_A.T @ lora_B.T)`. Feed MLX's orientation to PEFT and, whenever the
shapes happen to be square or compatible, you get a model that loads, runs, and is quietly wrong.
So `verify_equivalence` reconstructs the full delta-W under both conventions and compares them
element-wise. A converter for this must prove itself arithmetically, not by inspection.

SCALING. mlx-lm applies `scale` as the multiplier directly. PEFT derives its multiplier as
`lora_alpha / r`. To preserve the trained behaviour exactly: `lora_alpha = scale * r`.

Usage:
    python src/mlx_to_peft.py adapters/apple-v3 out/apple-v3-peft --base meta-llama/Llama-3.2-3B-Instruct
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from safetensors.numpy import load_file, save_file

MLX_KEY = re.compile(r"^(?P<path>.+)\.lora_(?P<ab>[ab])$")

# Cloudflare's stated limits for a custom adapter.
MAX_ADAPTER_BYTES = 300 * 1024 * 1024
MAX_RANK = 32


def convert_tensors(mlx: dict[str, np.ndarray]) -> tuple[dict[str, np.ndarray], set[str], int]:
    """MLX tensors -> PEFT tensors. Returns (tensors, target_modules, rank)."""
    out: dict[str, np.ndarray] = {}
    targets: set[str] = set()
    ranks: set[int] = set()

    for key, value in mlx.items():
        m = MLX_KEY.match(key)
        if not m:
            raise ValueError(f"unrecognised MLX adapter key: {key!r}")
        path, ab = m.group("path"), m.group("ab")

        # `lora_a` is [in, rank]; `lora_b` is [rank, out]. The rank is the shared inner dimension,
        # which is the one axis that is the same in both and therefore the one to read it from.
        ranks.add(value.shape[1] if ab == "a" else value.shape[0])
        targets.add(path.rsplit(".", 1)[-1])

        peft_name = "A" if ab == "a" else "B"
        out[f"base_model.model.{path}.lora_{peft_name}.weight"] = np.ascontiguousarray(value.T)

    if len(ranks) != 1:
        raise ValueError(f"inconsistent rank across tensors: {sorted(ranks)}")
    return out, targets, ranks.pop()


def verify_equivalence(mlx: dict[str, np.ndarray], peft: dict[str, np.ndarray], scale: float, alpha: float, rank: int) -> None:
    """Reconstruct delta-W under both conventions and require them to match.

    This is the whole point of the file. A transposition error produces weights that load without
    complaint and are silently wrong, so the check has to be arithmetic.
    """
    checked = 0
    for key, a in mlx.items():
        m = MLX_KEY.match(key)
        if not m or m.group("ab") != "a":
            continue
        path = m.group("path")
        b = mlx.get(f"{path}.lora_b")
        if b is None:
            raise ValueError(f"{path} has lora_a but no lora_b")

        # MLX:  delta = scale * (a @ b)                       [in, out]
        mlx_delta = scale * (a.astype(np.float32) @ b.astype(np.float32))

        # PEFT: delta = (alpha / r) * (B @ A)                 [out, in] -> transpose to compare
        A = peft[f"base_model.model.{path}.lora_A.weight"].astype(np.float32)
        B = peft[f"base_model.model.{path}.lora_B.weight"].astype(np.float32)
        peft_delta = ((alpha / rank) * (B @ A)).T

        if mlx_delta.shape != peft_delta.shape:
            raise AssertionError(f"{path}: shape {mlx_delta.shape} vs {peft_delta.shape}")
        denom = max(float(np.abs(mlx_delta).max()), 1e-8)
        err = float(np.abs(mlx_delta - peft_delta).max()) / denom
        if err > 1e-5:
            raise AssertionError(f"{path}: delta-W differs by {err:.2e} relative — the conversion is wrong")
        checked += 1

    if checked == 0:
        raise AssertionError("no lora_a/lora_b pairs were verified — refusing to emit an unchecked adapter")
    print(f"  verified delta-W equivalence on {checked} projection(s), max relative error < 1e-5")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("adapter_dir", type=Path, help="MLX adapter dir (adapters.safetensors + adapter_config.json)")
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--base", required=True, help="base model repo the adapter was trained against")
    args = ap.parse_args()

    cfg = json.loads((args.adapter_dir / "adapter_config.json").read_text())
    lp = cfg.get("lora_parameters", {})
    rank_cfg = int(lp.get("rank", 8))
    scale = float(lp.get("scale", 20.0))
    dropout = float(lp.get("dropout", 0.0))

    mlx = load_file(str(args.adapter_dir / "adapters.safetensors"))
    peft, targets, rank = convert_tensors(mlx)
    if rank != rank_cfg:
        print(f"  note: tensor rank {rank} differs from config rank {rank_cfg}; trusting the tensors")

    # mlx-lm multiplies by `scale` directly; PEFT multiplies by lora_alpha / r.
    alpha = scale * rank
    verify_equivalence(mlx, peft, scale, alpha, rank)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    save_file(peft, str(args.out_dir / "adapter_model.safetensors"))
    (args.out_dir / "adapter_config.json").write_text(json.dumps({
        "peft_type": "LORA",
        "task_type": "CAUSAL_LM",
        "base_model_name_or_path": args.base,
        "r": rank,
        "lora_alpha": alpha,
        "lora_dropout": dropout,
        "bias": "none",
        "fan_in_fan_out": False,
        "inference_mode": True,
        "target_modules": sorted(targets),
    }, indent=2) + "\n")

    size = (args.out_dir / "adapter_model.safetensors").stat().st_size
    print(f"  wrote {len(peft)} tensors, rank {rank}, alpha {alpha}, targets {sorted(targets)}")
    print(f"  adapter_model.safetensors: {size / 1e6:.1f} MB")

    # Fail loudly here rather than at upload: Cloudflare's limits are stated, so a violation is
    # knowable now.
    problems = []
    if size > MAX_ADAPTER_BYTES:
        problems.append(f"adapter is {size / 1e6:.0f}MB, over Cloudflare's 300MB limit")
    if rank > MAX_RANK:
        problems.append(f"rank {rank} exceeds Cloudflare's maximum of {MAX_RANK}")
    if problems:
        for p in problems:
            print(f"  REFUSED: {p}", file=sys.stderr)
        return 1

    print("  within Cloudflare's adapter limits (rank <= 32, < 300MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
