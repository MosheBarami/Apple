# Mobile QA at 375 px, 2026-09-23 ~04:45 IDT

A real Chrome popup window opened from a user gesture at `window.open(..., 'popup,width=375,height=812')`
measured `innerWidth` 375 (the owner's Chrome, signed in). The pages were loaded in it and measured from the
same-origin opener. An iframe could not be used: every page answers `X-Frame-Options: DENY` (correct).

| Page | Page width at 375 | Sideways overflow | Notes |
|---|---|---|---|
| / | 360 + 15 scrollbar | none | small targets are inline text links only |
| /pricing | 360 | none | same |
| /models | 360 | none | same |
| /app (projects) | 360 | none | "New project" 16..344 px, 36 px tall; row menus 28x28 (WCAG 2.5.8 min 24) |
| /app/projects/:id (workspace) | 375 | none | menu button 46x46; composer 341 px wide, 16 px text (no iOS zoom); send 32x32 on screen |
| /app/settings | 375 | none | the section tabs are a horizontally scrolling strip (`ul.st-nav__list` overflow auto), by design |
| /app/usage | 360 | none | |

The phone menu: "Open navigation" sets aria-expanded=true and opens `aside.gx-rail.is-open` 338x755 with New chat
(50 px), the recent projects (47 px each), View all chats, Checkpoints, the account, the Credits balance and
Settings.

NOT measured: pixels. Screen capture of Chrome was declined in the permission dialog, and the tab group's own
screenshots cannot show a phone width because the owner's Chrome runs at ~60 % page zoom (outerWidth 882,
innerWidth 1470) and a window cannot be narrower than Chrome's minimum. Contrast and visual defects at phone
width are therefore unverified by eye.
