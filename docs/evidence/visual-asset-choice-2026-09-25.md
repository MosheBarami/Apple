# Visual asset choice — 2026-09-25

The owner rejected the earlier Studio game on visual quality. This remains a failed visual acceptance run.

## Measured today

- The worker and web at commits `6931dc8` and `0f7f6d6` were deployed from a clean export. `/api/health` reported `0f7f6d6`.
- An unauthenticated GET of `/api/library-preview/56449156` returned HTTP 302 to `https://tr.rbxcdn.com/.../420/420/Model/Png/noFilter`; a malformed id and an unrelated private API path returned 401. The redirect is limited to a matching completed Roblox thumbnail and a fixed CDN host.
- The local `studio-preview?scenario=asset-choice` rendered three actual Roblox model images. The three choice buttons and “None of these look right” were visible and enabled. This is a fixture, not a live Studio build or a completed owner-choice run.
- Visual judgment: the pictured trees are very simple block forms. This preview proves that the choice mechanism displays real images. It does **not** prove commercial asset quality, UI kit quality, successful insertion after choice, or a finished game.
- Clean-export worker tests: 4,189 passed, 2 skipped, 0 failed. Clean-export web tests: 2,427 passed, 0 failed. The security test's 56 checks passed in the checkout.

## Remaining release evidence

A live owner choice must resume a Studio build and insert the chosen model. The asset inventory must supply visually stronger and rights-checked candidates. UI, VFX, audio and animation choices need their own previews. A new full game needs gameplay and a blind visual review. F-059 and F-064 remain open.
