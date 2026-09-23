# NEXT ACTION

**Wait for Roblox's appeal decision on Apple Studio, then flip the store switch.** The final plugin build
(sha256 8a9ec295) was published over asset 107230158271368 on 2026-09-23 14:00 IDT and removed the same minute
("Misusing Roblox Systems", 3Jj4h4hPWRTA3QPDRlNRmejqPrP). The appeal was sent at 14:02; Roblox estimates 5
business days (evidence/20260923T1100Z-final-publish-appeal).

1. Re-probe `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=107230158271368,6415005344`
   (Rojo is the control) and the Violations & Appeals page once a day.
2. Accepted → set STUDIO_PLUGIN_STORE_LIVE true, drop the known-issue entry, redeploy site + web, close
   F-020/F-034/F-038 with the probe as evidence (per docs/PLUGIN-RELEASE.md).
3. Refused → read the stated reason, record it in F-038, and change only what it names. Never remove a tool
   (owner direction); a second appeal is not possible on the same decision.

Three fresh reviews, once the running lanes have shipped: `python3 scripts/autonomy-supervisor.py --reviews-only`
runs reviewer sessions beside this interactive session (D-AUT-2) and keeps the streak itself. Optional: F-053 (undo after generate_model).
