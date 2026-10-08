# Third-party notices

StudPilot uses ideas and adapted text from the open-source projects below (planning/REBUILD-PLAN.md).

## Nixera-Studio/roblox-ai-studio

https://github.com/Nixera-Studio/roblox-ai-studio. Used: the coordinator, planner, coder, reviewer and test-engineer
team shape (apps/studio/src/agents/studpilot.ts) and its UI guide, adapted into apps/studio/src/agents/build-rules.ts.

```
MIT License

Copyright (c) 2026 AI Studio contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Flue (withastro/flue), the Cloudflare Agents SDK and Kumo

The Studio app is built on Flue (`@flue/runtime`, `@flue/react`, `@flue/sdk`), Cloudflare's Agents SDK and Kumo design
system, and follows the layout of cloudflare/agents-starter. They are dependencies, under their own licences in
`node_modules`.

## Not used

madebyshaurya/stud is AGPL-3.0: no code of it is in StudPilot (owner decision pending, planning/proof/BLOCKED.md N10).

## vercel/chatbot (apps/www)
Copyright 2024 Vercel, Inc. Licensed under the Apache License, Version 2.0. apps/www starts from
https://github.com/vercel/chatbot at commit c2f8235e1f3ea903ad8b7f61447c4f74164b5c58; the licence text is apps/www/LICENSE,
and apps/www/TEMPLATE.md lists what was changed.


## Cursor visual reference (apps/www, 2026-10-08)

The owner supplied https://cursor.com/ as the visual reference. The site and agent workspace layouts were reconstructed for StudPilot; Cursor source code, branded product screenshots and font binaries are not distributed. The hero landscape file `apps/www/public/art/landscape-cursor.webp` is an optimized copy of the reference site's publicly served landscape at https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/misc/asset-cc24ca462279ca23250c.jpg. Its original artist and reuse licence have not been established independently; this notice is source attribution, not a licence grant. The visual study and source map are in `planning/proof/W-Cursor-2026-10-08/REFERENCE-MAP.md`.
