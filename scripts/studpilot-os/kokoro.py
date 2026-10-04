"""Generate one local WAV with Kokoro ONNX. Text arrives on stdin, never in argv."""
import json
import sys

import soundfile as sf
from kokoro_onnx import Kokoro


def main():
    if len(sys.argv) != 4:
        raise SystemExit("expected model, voices, output paths")
    request = json.load(sys.stdin)
    text = request.get("text")
    if not isinstance(text, str) or not 0 < len(text) <= 1000:
        raise SystemExit("text must contain 1–1000 characters")
    voice = request.get("voice", "af_sarah")
    if voice not in {"af_sarah", "af_heart", "am_adam"}:
        raise SystemExit("unsupported voice")
    kokoro = Kokoro(sys.argv[1], sys.argv[2])
    samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0, lang="en-us")
    sf.write(sys.argv[3], samples, sample_rate)


if __name__ == "__main__":
    main()
