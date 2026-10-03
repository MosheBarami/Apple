---
name: explain-a-decision
description: Explain why something was decided or why something failed, using docs/DECISIONS.md (ADRs), docs/FAILURES.md, the V3 decision log and the owner's memory.
---
# Explain a decision

Use for "why did we do X", "what was decided about Y", "what went wrong with Z", "why not W".

1. `search_knowledge` with the topic. Decisions live in `docs/DECISIONS.md` (ADR-001..), `docs/autonomy/DECISIONS.md` and `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md`; failures and falsified claims in `docs/FAILURES.md` (entries F-NN); owner preferences and standing rulings in the memory notes (`memory/...`).
2. Open the ADR or entry with `read_file` (the knowledge hit gives the line range; read 20 lines beyond it). Quote the decision, the reasons and the evidence they cite; note the date and status (accepted, superseded, revoked).
3. Check for supersession: `search_knowledge` for the ADR number or topic with words like "supersedes", "revoked", "overrides"; V3 handoff text supersedes older mission text, and the owner's later rulings override earlier ones.
4. Check the code agrees: `search_code` for the identifier the decision introduced; a decision that the code contradicts is worth saying.
5. Answer: the decision in one sentence, why (2-4 bullets), what it replaced or what replaced it, and `path:line` citations. If no decision record exists, say "I could not find a recorded decision" and give the nearest evidence.
