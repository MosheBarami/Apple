#!/usr/bin/env python3
"""Embed stdin JSON strings with the pinned, locally cached BGE model on CPU."""

import json
import sys

import torch
import torch.nn.functional as F
from huggingface_hub import snapshot_download
from transformers import AutoModel, AutoTokenizer

MODEL = "BAAI/bge-base-en-v1.5"
REVISION = "a5beb1e3e68b9ab74eb54cfd186867f64f240e1a"


def main():
    texts = json.load(sys.stdin)
    if not isinstance(texts, list) or not texts or not all(isinstance(s, str) for s in texts):
        raise ValueError("expected a non-empty list of document strings")
    path = snapshot_download(MODEL, revision=REVISION, local_files_only=True)
    torch.set_num_threads(4)
    tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
    model = AutoModel.from_pretrained(path, local_files_only=True).eval().cpu()
    vectors = []
    with torch.no_grad():
        for start in range(0, len(texts), 8):
            tokens = tokenizer(texts[start:start + 8], padding=True, truncation=True,
                               max_length=512, return_tensors="pt")
            cls = model(**tokens).last_hidden_state[:, 0, :]
            vectors.extend(F.normalize(cls, p=2, dim=1).tolist())
    json.dump(vectors, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
