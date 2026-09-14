"""Pre-render training text so the assistant span matches inference EXACTLY.

WHY THIS FILE EXISTS. Apple v1 emitted a stray `<think></think>` block before every single answer
(8/8 on held-out prompts). The cause was not the data and not the hyperparameters:

    training   <|im_start|>assistant\n<think>\n\n</think>\n\nREPLY<|im_end|>
    inference  <|im_start|>assistant\n

`apply_chat_template` inserts an empty thinking block into a COMPLETED assistant turn, and the
generation prefix does not contain it. With `mask_prompt: true` the loss covers the assistant span
including those tokens, so the model was explicitly taught to produce them. It learned exactly what
it was shown.

The rule this enforces: the text a model is trained to continue from must be byte-identical to the
text it will be asked to continue from. `assert_prefix_match` fails loudly if that ever stops being
true, because the failure mode is silent — the loss curve looks healthy the whole way down.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
from transformers import AutoTokenizer


def generation_prefix(tok, messages) -> str:
    """Exactly what the model sees at inference time, up to where it must start writing."""
    return tok.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)


def training_text(tok, messages) -> str:
    """Prefix + the target completion, with nothing between them that inference will not supply."""
    prompt = messages[:-1]
    reply = messages[-1]
    assert reply["role"] == "assistant", "the last message must be the target"
    return generation_prefix(tok, prompt) + reply["content"] + tok.eos_token


def assert_prefix_match(tok, messages) -> None:
    """The training text must literally begin with the inference prefix."""
    prefix = generation_prefix(tok, messages[:-1])
    text = training_text(tok, messages)
    if not text.startswith(prefix):
        raise AssertionError(
            "training text does not start with the inference prefix — the model would be trained "
            f"to emit something it is never shown.\n  prefix: {prefix[-120:]!r}\n  text:   {text[:len(prefix)][-120:]!r}"
        )
    injected = text[len(prefix):]
    for marker in ("<think>", "</think>"):
        if marker in injected[:64]:
            raise AssertionError(f"template injected {marker!r} into the target span: {injected[:80]!r}")


def main() -> int:
    src, dst, model = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    tok = AutoTokenizer.from_pretrained(model)
    dst.mkdir(parents=True, exist_ok=True)
    for split in ("train", "valid", "test"):
        inp = src / f"{split}.jsonl"
        if not inp.exists():
            continue
        rows, checked = [], 0
        for line in inp.open():
            msgs = json.loads(line)["messages"]
            if checked < 25:
                assert_prefix_match(tok, msgs)
                checked += 1
            rows.append({"text": training_text(tok, msgs)})
        out = dst / f"{split}.jsonl"
        out.write_text("".join(json.dumps(r) + "\n" for r in rows))
        print(f"  {split:5} {len(rows):5} rows -> {out}  (prefix-verified on {checked})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
