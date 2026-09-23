# NEXT ACTION

**Gauntlet round 6 (simulator target: map, models and UI), once two changes ship.**

1. F-064 to F-067: DEPLOYED 2026-09-23 (fe2bdf2, version 8ccfe2c2). A run is no longer ended while the
   request's own list has parts unbuilt (run-parts.ts); skill cards ship in the same deploy. Check live in
   round 6: "The request is not finished" steers appear, and context_budget maxChars is about 116k.
2. D-UIONLY-1 (owner order, 2026-09-23): Apple never builds UI by hand. Every UI part comes from the
   stored library (packages/asset-library packs and sources) through one component tool. Raw GUI
   creation and scripts that Instance.new GUI classes are refused. Every component is shown in real
   Studio (docs/gauntlet/visual/ui-library/).
   D-MODELLIB-1 (owner order, 2026-09-23), the same for 3D: props, buildings, nature, vehicles and pets
   come from the model library (packages/asset-library/models) through find_library_model and
   insert_library_model. create_instances refuses a part-built prop the library holds; parts stay for
   terrain, baseplates, paths and zones. Studio inserts per genre are in docs/gauntlet/visual/model-library/.
3. Round 6:
   - fresh place;
   - new project and pairing (plugin 1.2.0 needs a Studio reload first);
   - Autonomous ON, Apple MAX, the same prompt;
   - then `compare.py --round 6 --test map|models|ui`, each comparison sent to the owner.

Cloudflare lane, live since 2026-09-23: web (Turnstile widget) deployed, TURNSTILE_SECRET set; a
recovery request with no token or a forged one answers 403. After round 6: Supabase captcha (provider
turnstile, same secret), once the scripted test sign-ins carry a token or use a bypass. The probe worker
apple-cf-probe and queue apple-cf-probe-q are idle leftovers; the safety hook forbids removing a worker,
so they stay until the owner removes them.

## Parked: the Creator Store appeal

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
