---
title: Apple · מדידת אימון
emoji: 🍎
colorFrom: red
colorTo: yellow
sdk: static
app_file: index.html
short_description: Private snapshot of the locally measured Apple LoRA adapter.
models:
  - moshebarami/apple-lora
---

# Apple training results

Private, static snapshot of the local LoRA evaluation. This page does not run model inference and
does not represent the model currently served to Apple customers. `index.html` in this repository
is a template. The training supervisor renders and uploads it only after a completed, paired
evaluation promotes a version, the matching adapter was uploaded to the private model repository,
and the Space is confirmed private. A failed or unmeasured run never updates this page. The upload
is checked by downloading the current Space file and comparing its SHA-256 to the rendered file.
