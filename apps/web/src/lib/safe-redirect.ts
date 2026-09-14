/**
 * Where a post-login redirect is allowed to send someone.
 *
 * `AuthGuard` stashes `location.pathname` so a signed-out visitor lands back
 * where they were aiming, and the login form then calls `navigate(from)`. The
 * catch-all `<Route path="*">` lives INSIDE that guard, so every path reaches it
 * — including one an attacker chose.
 *
 * react-router 6.30.6 (what this project resolves to) sits inside the vulnerable
 * range of "open redirect via backslash in <Link> and useNavigate", fixed in
 * 7.18.0, where `/\evil.com` and `//evil.com` are treated as protocol-relative
 * and navigate off-origin. So a link to `https://app.apple/\evil.com` bounces a
 * user who has JUST authenticated straight to an attacker's page — the worst
 * possible moment for it, because they have just been asked to trust the screen.
 *
 * This validates at the sink instead of upgrading, deliberately. The advisory's
 * fix is react-router 7: a major upgrade touching every route in the app, for a
 * defect we can close with an allowlist that holds no matter which router
 * version is installed. Keep this even after an upgrade — it costs nothing, and
 * it does not depend on a library keeping a promise.
 */
export function safeInternalPath(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || raw === '') return fallback;

  // Backslashes are the whole trick: browsers and routers disagree about whether
  // `\` is a path separator, so normalise before judging rather than trying to
  // reason about which one wins in a given engine.
  const path = raw.replace(/\\/g, '/');

  // Must be a rooted, same-origin path. `//host` — and `/\host` once folded — is
  // a protocol-relative URL wearing a path's clothes.
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;

  // A scheme cannot legitimately appear in a rooted path; if one does, this was
  // a URL rather than a route.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(path)) return fallback;

  // Control characters (including a raw newline or NUL) would let a target be
  // smuggled past the checks above once something downstream re-parses it.
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;

  return path;
}
