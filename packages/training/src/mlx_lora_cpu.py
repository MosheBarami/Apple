"""Run the pinned mlx-lm LoRA command on CPU when Metal's display watchdog interrupts it.

This changes only this child process. The ordinary supervisor path remains GPU training.
MLX's trainer checks metal.is_available() even when the default device is CPU and then
queries a GPU-only memory field; suppress that check for this explicitly CPU run.
"""

import mlx.core as mx

mx.set_default_device(mx.cpu)
mx.metal.is_available = lambda: False

from mlx_lm.lora import main  # noqa: E402 — device selection must precede mlx-lm import


if __name__ == "__main__":
    main()
