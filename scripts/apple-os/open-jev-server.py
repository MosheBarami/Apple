"""Loopback-only inference for the independent open-Jev model downloaded from Hugging Face.

The model snapshot lives in ~/Documents/Apple-OS/runtime, outside the shared repository.
No request text is logged or sent to Hugging Face during inference.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import torch

MODEL_ID = "com-kotobalabs/open-jev-deberta-v3-large"
MODEL_REVISION = "188ee67a5c93122b916e5acd5bdb0cb3623e380a"
MODEL_DIR = Path(os.environ.get(
    "APPLE_OS_OPEN_JEV_MODEL_DIR",
    str(Path.home() / "Documents/Apple-OS/runtime/open-jev-model"),
))
PORT = int(os.environ.get("APPLE_OS_OPEN_JEV_PORT", "4778"))


def load_model():
    if not (MODEL_DIR / "model.safetensors").is_file():
        raise FileNotFoundError(f"Hugging Face model snapshot missing at {MODEL_DIR}")
    import sys

    sys.path.insert(0, str(MODEL_DIR))
    from typed_decisions.open_jev import OpenJev

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    return OpenJev.from_pretrained(str(MODEL_DIR), device="cpu")


class Handler(BaseHTTPRequestHandler):
    model = None

    def log_message(self, format, *args):
        # Never log the owner's prompts or inference payloads.
        pass

    def reply(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"ok": False})
        return self.reply(200, {"ok": True, "model": MODEL_ID, "revision": MODEL_REVISION,
                                "device": "cpu", "hosting": "local"})

    def do_POST(self):
        if self.path != "/decide":
            return self.reply(404, {"ok": False})
        # Browser pages cannot spend local inference by posting across origins.
        if self.headers.get("Origin") or self.headers.get("Host") not in (
            f"127.0.0.1:{PORT}", f"localhost:{PORT}",
        ):
            return self.reply(403, {"ok": False, "error": "local-client-only"})
        if self.headers.get("Content-Type", "").split(";", 1)[0].lower() != "application/json":
            return self.reply(415, {"ok": False, "error": "json-only"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 10000:
                return self.reply(413, {"ok": False, "error": "invalid-size"})
            data = json.loads(self.rfile.read(size))
            state = data.get("state")
            question = data.get("question")
            options = data.get("options")
            if not isinstance(state, str) or not 1 <= len(state) <= 4000:
                return self.reply(400, {"ok": False, "error": "invalid-state"})
            if not isinstance(question, str) or not 1 <= len(question) <= 300:
                return self.reply(400, {"ok": False, "error": "invalid-question"})
            if not isinstance(options, list) or not 2 <= len(options) <= 8 or not all(
                isinstance(option, str) and 1 <= len(option) <= 200 for option in options
            ) or len(set(options)) != len(options):
                return self.reply(400, {"ok": False, "error": "invalid-options"})
            answer = self.model.decide(state, [{"type": "choice", "instructions": question,
                                                "options": options}])[0]
            return self.reply(200, {"ok": True, "model": MODEL_ID, "answer": answer})
        except (ValueError, KeyError, TypeError):
            return self.reply(400, {"ok": False, "error": "invalid-request"})
        except Exception:
            return self.reply(500, {"ok": False, "error": "inference-failed"})


if __name__ == "__main__":
    Handler.model = load_model()
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
