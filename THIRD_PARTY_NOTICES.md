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
