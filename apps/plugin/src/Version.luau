--!strict
-- WHAT THIS BUILD IS.
--
-- The plugin cannot discover its own identity at runtime. This is not an
-- oversight to be worked around later — it is a property of the platform.
-- Every member of `Plugin` and `StudioService` was enumerated against the
-- engine reference: neither exposes the plugin's asset id or version. So a
-- constant baked in at build time is the ONLY reliable answer, and it has to
-- exist before first distribution, because a plugin already installed on
-- someone's machine can never be retrofitted with one (updates are manual —
-- see the release workflow header).
--
-- TWO NUMBERS, DELIBERATELY.
--
--   VERSION   Human-facing build identity. Semver. Bumped on EVERY republish,
--             including pure UI polish. Carries no compatibility meaning.
--
--   PROTOCOL  The plugin<->worker wire contract. An integer, bumped ONLY when
--             the worker genuinely cannot serve an older plugin any more.
--
-- Keeping these apart is the whole point. If the server gated on VERSION, then
-- shipping a cosmetic 0.2.0 would lock out every 0.1.x user — and because
-- Studio updates require the user to click Update themselves, "locked out"
-- means locked out indefinitely, with no self-service remedy. Version skew is
-- the normal steady state of this product, not an error condition. So the
-- server gates on PROTOCOL, which changes almost never, and ignores VERSION
-- for admission purposes entirely.
--
-- Bump PROTOCOL only alongside a matching MIN_PLUGIN_PROTOCOL change in
-- apps/worker/src/plugin-version.ts, and only when an old client would
-- genuinely misbehave rather than merely lack a feature.

return table.freeze({
	-- Parsed by scripts/inspect-plugin-build.py and .github/workflows/plugin-release.yml.
	-- Keep the assignment on one line and quoted, or the release job will not find it.
	VERSION = "0.2.0",
	PROTOCOL = 1,
})
