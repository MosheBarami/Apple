# Validation before deployment

2026-10-08. Existing release checkout; no branch or clone created.

- Website browser suite: 29/29 pass.
- Uiverse and Studio pairing lifecycle browser suite: 11/11 pass.
- Assembly, chat draft failure/reload, scroll, motion and layout suite: 7/7 pass.
- TypeScript: pass. check-www: clean, 111 files. git diff --check: pass.
- Rendered screens inspected: homepage, new creation, active chat, projects, library, settings, login, pricing and documentation. Responsive coverage at 390, 768, 1024 and 1440 pixels; composer also checked at 1280x720.
- Motion inspected while moving, paused and resumed; reduced-motion tested. Menu, modal, theme, source preview and demo transitions exercised. No uncaught browser exceptions.
- Settings refined after identifying its empty right-hand area as the weakest composition.
- Original illustration, attributed Uiverse source manifest and licensed self-hosted fonts; unused third-party landscape removed because provenance was not established.

Browser results are attached JSON. These use development fixtures for chat activity and failure cases and pairing backend fault/expiry injection. They do not prove a live AI run, OAuth callback, or plugin pairing. The live deployment and authenticated smoke check are recorded separately after release.

Public screenshots contain no customer content. Authenticated screenshots remain in the owner's local visualization output and are not committed to this public repository.

Production build: Next compilation, TypeScript, static generation and OpenNext bundle completed. First attempt exhausted disk space; only this task's generated .next and .next-release directories were removed before retrying. OpenNext emitted three dependency-copy warnings, but produced its Worker. A local wrangler production Worker returned HTTP 200; the browser loaded both fonts, selected an illustration layer and opened the interactive demo successfully. Final deployed routes remain the release acceptance check.

Changed-file credential scan using the repository scanner's patterns: 32 paths, zero findings.

Release-marker correction: the first live upload served the new design but runtime
metadata fell back to `development`. The verifier correctly rejected it. Explicitly
inline the public commit marker with Next's build-time env configuration (official
reference: https://nextjs.org/docs/app/api-reference/config/next-config-js/env).
The release is not accepted until public HTML reports the exact main commit.
