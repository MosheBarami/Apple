#!/usr/bin/env python3
"""Scan every blob ever committed, on every ref, for credentials.

Runs in CI on a full-depth clone. A secret that was committed and later removed
is still a leaked secret, so scanning the working tree alone would be theatre.

Exit 0 = clean, exit 1 = something needs a human. Findings are reported by
pattern and path; the matched value is truncated so the scanner's own output
never becomes the leak.

FAIL-CLOSED ON ANYTHING NEW. A credential in the working tree has always failed
the build. A credential surviving only in HISTORY used to warn and exit 0 — for
every finding, forever — which meant a credential committed and then removed in
the same session was permanently downgraded to a warning nobody reads. Now a
history-only finding fails too, UNLESS its blob is named in the register at
scripts/known-exposures.json.

The register is keyed by blob SHA and holds no values. A new leak is a new blob,
so it cannot inherit an existing acceptance, and re-committing a known-leaked file
produces a new blob as well. A register entry that stops matching anything fails
the run rather than lingering as a comment claiming a review it no longer covers.

WHAT THE REGISTER DOES NOT DO, since "fail-closed" oversells it on its own. It is
an ALLOWLIST, not an attestation. Its `pattern` and `path` fields are documentation
— only `blob` is compared — so anyone who can commit can add an entry naming
anything they like, and `--record-exposures` accepts the current findings wholesale
without evidence that a rotation happened. The control is that the register is
tracked and therefore diffable: a new line in it is a reviewable event. The tool
makes a new leak VISIBLE and blocks it until someone signs off in the diff; it
cannot tell whether that sign-off was earned.

Record the current state after rotating with:  secret-scan.py --record-exposures
"""
from __future__ import annotations

import base64
import collections
import json
import pathlib
import re
import subprocess
import sys

# Rules whose match is UNAMBIGUOUS on its own. A vendor-prefixed key is a key
# wherever it appears: no word near it can make `AKIA…` or a PRIVATE KEY block
# into a placeholder. These are never suppressed by the ALLOW list below — see
# the note there for the hole that cost.
HARD_SIGNATURE = {
    "AWS access key id", "OpenAI key", "Anthropic key", "Google API key",
    "GitHub token", "Slack token", "Stripe live secret", "Private key block",
    "JWT", "Roblox session cookie",
}

PATTERNS = [
    ("AWS access key id", re.compile(rb"AKIA[0-9A-Z]{16}")),
    ("OpenAI key", re.compile(rb"sk-[A-Za-z0-9_\-]{32,}")),
    ("Anthropic key", re.compile(rb"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("Google API key", re.compile(rb"AIza[0-9A-Za-z_\-]{35}")),
    ("GitHub token", re.compile(rb"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("Slack token", re.compile(rb"xox[baprs]-[0-9A-Za-z\-]{10,}")),
    ("Stripe live secret", re.compile(rb"sk_live_[0-9A-Za-z]{20,}")),
    ("Private key block", re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("JWT", re.compile(rb"eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}")),
    ("Cloudflare API token", re.compile(rb"(?i)cloudflare[_a-z]*token[\"'\s:=]+[A-Za-z0-9_\-]{35,}")),
    ("Supabase service role", re.compile(rb"(?i)service_role[\"'\s:=]+[A-Za-z0-9._\-]{40,}")),
    ("Assigned secret literal",
     re.compile(rb"(?i)\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*[\"'][A-Za-z0-9/+_\-]{24,}[\"']")),
    # A real account password is often shorter than 24 characters and contains
    # punctuation the rule above excludes. A 20-character one lived in four
    # committed scripts for weeks precisely because the generic threshold missed
    # it, so passwords get their own, tighter rule.
    ("Password literal",
     re.compile(rb"(?i)\bpass(?:word|wd)?\b\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']")),
    #[[ THE TWO CREDENTIAL FAMILIES THIS PRODUCT ACTUALLY HANDLES, AND HAD NO RULE FOR.
    #
    #   This is a Roblox builder deployed on Cloudflare. `.ROBLOSECURITY` is the
    #   highest-value credential in its threat model — plugin-release.yml discusses at
    #   length why it must never reach CI — and nothing here could see one. A Roblox
    #   Open Cloud key is opaque with no prefix, so it can only be caught by its name.
    #
    #   The cookie carries its own warning banner, which makes it self-identifying and
    #   effectively false-positive-free. ]]
    ("Roblox session cookie", re.compile(rb"_\|WARNING:-DO-NOT-SHARE-THIS")),
    ("Roblox API key",
     re.compile(rb"(?i)\brobloxa?[_-]?(?:api[_-]?key|open[_-]?cloud[_-]?key)\b\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{24,}")),
    #[[ AND THE UNQUOTED FORMS. Both rules above this line require a QUOTED value, so
    #   `password: hunter2hunter2` in YAML and `SERVICE_KEY=sbp_…` in a .env-style file
    #   were both invisible — which is the same structural miss that let two live
    #   passwords sit in a Markdown table (docs/BLOCKERS.md) while the scanner called
    #   the tree clean. Unquoted values have no delimiter, so the bar is raised to 20
    #   characters of credential alphabet to keep prose out. ]]
    #   No leading \b: `SUPABASE_SERVICE_KEY=` has no word boundary before SERVICE,
    #   because `_` is a word character — the most common shape in a .env file was the
    #   one the first draft of this rule could not see. 16 rather than 24 because an
    #   unquoted value is bounded by whitespace, so ordinary prose cannot reach it in a
    #   single token.
    #
    #   The value must also contain a DIGIT. Without that, this rule flagged four Roblox
    #   API type declarations in apps/plugin/globalTypes.d.luau — `Password:
    #   EnumCommunicationChannel` is an annotation, not a credential, and a CamelCase
    #   type name clears sixteen characters easily. A generated unquoted secret with no
    #   digit anywhere in it is rare enough to trade for that.
    ("Assigned secret literal, unquoted",
     re.compile(rb"(?i)(api[_-]?key|secret|password|passwd|service[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*(?=[A-Za-z0-9/+_\-]*[0-9])[A-Za-z0-9/+_\-]{16,}")),
]

#[[ Strings that mark a value as deliberately not a credential.
#
#   NARROWED, and the hole it closed is worth keeping in view. This used to include
#   `\.\.\.` and `<[a-z_]+>`, and it was applied to EVERY rule. So an ellipsis or any
#   lowercase HTML tag within 70 bytes suppressed the finding — which meant a real
#   a real PEM private-key header inside a `<pre>` block, or an AWS access key id above
#   a `# ... set in CI` comment, scanned clean. Both were reproduced against these
#   exact objects before the change.
#
#   Two fixes, and the second matters more: the prose-shaped entries are gone, and
#   this list is now applied ONLY to the keyword-heuristic rules (see HARD_SIGNATURE).
#   A vendor-prefixed key is a key regardless of what is written near it.
#
#   THE EXAMPLES BELOW ARE DESCRIBED, NOT SPELLED OUT, and that is not squeamishness:
#   the first version of this comment quoted a real PEM header, and because the
#   private-key rule is now a HARD_SIGNATURE that ALLOW can no longer suppress, the
#   scanner flagged its own documentation and CI went red. A scanner whose comments
#   trip it is a scanner people start ignoring.
#
#   `SENTINEL` was added when the new Roblox rule correctly flagged
#   packages/evals/src/security.test.mjs — a map of FABRICATED values whose entire
#   purpose is to be findable, so that a leak test can assert they never appear in a
#   response. Every one is prefixed `SENTINEL-`, which is exactly the explicit
#   not-a-credential marker this list is for. ]]
ALLOW = re.compile(
    rb"(?i)(example|placeholder|your[_-]|xxx+|redacted|dummy|sample|fake|changeme|SENTINEL|\bTODO\b)"
)

#[[ Extensions skipped before the blob is even read.
#
#   `.rbxm`, `.zip` and `.gz` were removed. The NUL-byte guard below already skips
#   genuine binaries, so listing them here bought nothing and cost coverage of the
#   one artifact this repository actually BUILDS: scripts/inspect-plugin-build.py
#   exists precisely because an .rbxm hides script text, and that inspector only runs
#   in plugin-release.yml against a freshly built file. A COMMITTED .rbxm was scanned
#   by neither. The remaining entries are lossy media that cannot hold a readable
#   assignment. ]]
SKIP_EXT = (b".glb", b".png", b".jpg", b".jpeg", b".webp", b".woff", b".woff2",
            b".ico", b".pdf", b".mp4")

# Historical exposures the owner has seen and accepted as "known, pending rotation".
# Keyed by blob SHA so an acceptance cannot generalise: it covers exactly the bytes
# that were reviewed and nothing else. Holds no credential values.
REGISTER_PATH = pathlib.Path(__file__).resolve().parent / "known-exposures.json"


def load_register() -> dict:
    if not REGISTER_PATH.exists():
        return {}
    data = json.loads(REGISTER_PATH.read_text())
    return {e["blob"]: e for e in data.get("accepted", [])}


def sh(*args: str) -> bytes:
    return subprocess.run(args, capture_output=True).stdout


def jwt_role(token: bytes) -> str | None:
    """The `role` claim of a JWT, or None if it will not decode.

    Supabase publishes an `anon` key that is *designed* to ship in browser
    bundles — it is public by construction and every query it can make is
    still gated by row-level security. Committing it is correct. A
    `service_role` key is the opposite: it bypasses RLS entirely.
    """
    try:
        body = token.split(b".")[1]
        body += b"=" * (-len(body) % 4)
        return json.loads(base64.urlsafe_b64decode(body)).get("role")
    except Exception:
        return None


def head_blobs() -> set[str]:
    """Blob shas reachable from the current commit."""
    out = sh("git", "ls-tree", "-r", "HEAD", "--format=%(objectname)").split()
    return {b.decode() for b in out}


def main() -> int:
    # A credential in an old commit cannot be un-leaked by a later commit — the
    # only real remedy is rotating it. So findings are split: anything present
    # in the CURRENT tree fails the build, because that is fixable by editing a
    # file; anything that survives only in history is reported loudly as a
    # rotation task but does not hold the build hostage forever.
    live = head_blobs()
    objects = sh("git", "rev-list", "--all", "--objects").splitlines()
    findings: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    scanned = 0

    for line in objects:
        parts = line.split(b" ", 1)
        if len(parts) != 2:
            continue
        sha, path = parts
        if path.lower().endswith(SKIP_EXT):
            continue
        blob = sh("git", "cat-file", "-p", sha.decode())
        if not blob or b"\0" in blob[:1024]:
            continue
        scanned += 1
        for name, pattern in PATTERNS:
            for match in pattern.finditer(blob):
                value = match.group()
                context = blob[max(0, match.start() - 70):match.end() + 40]
                # Only the keyword heuristics can be talked out of a finding.
                if name not in HARD_SIGNATURE and ALLOW.search(context):
                    continue
                if name == "JWT" and jwt_role(value) == "anon":
                    continue  # publishable by design; see jwt_role
                findings[name].append(
                    (
                        path.decode("utf8", "replace"),
                        value[:16].decode("utf8", "replace"),
                        sha.decode() in live,
                        sha.decode(),
                    )
                )

    print(f"blobs scanned across full history: {scanned}")
    if not findings:
        # Not an early return. A register whose every entry has stopped matching is
        # exactly the case this reports, and returning here made the docstring's
        # "a register entry that stops matching anything fails the run" false in the
        # one situation that produces it — a history rewrite that purged every match.
        register = load_register()
        if register and "--record-exposures" not in sys.argv:
            print("\nRESULT: THE EXPOSURE REGISTER IS STALE")
            print("Nothing on any ref matches any accepted blob. Re-record the register.")
            for blob, e in sorted(register.items())[:10]:
                print(f"::error::[{e['pattern']}] stale acceptance for {e['path']}  blob {blob[:12]}")
            return 1
        print("RESULT: clean — no credentials found on any ref")
        return 0

    in_tree = {n: [h for h in hits if h[2]] for n, hits in findings.items()}
    in_tree = {n: h for n, h in in_tree.items() if h}
    history_only = {n: [h for h in hits if not h[2]] for n, hits in findings.items()}
    history_only = {n: h for n, h in history_only.items() if h}

    if "--record-exposures" in sys.argv:
        # Refuse to record while the tree is dirty. This branch used to run BEFORE the
        # in-tree check, so a developer following the documented remediation with a
        # credential still in a tracked file was told "recorded N historical
        # exposure(s)" and given exit 0 — the tool reporting success at the one moment
        # it should not. CI still caught it, but a human was told otherwise.
        if in_tree:
            print("\nREFUSING TO RECORD: there is a credential in the CURRENT tree.")
            print("Remove it and commit first; the register is for history, not for the tree.")
            for name, hits in in_tree.items():
                print(f"::error::[{name}] {len(hits)} hit(s) in the working tree")
            return 1
        accepted = sorted(
            ({"blob": b, "pattern": n, "path": p} for n, hits in history_only.items()
             for p, _, _, b in hits),
            key=lambda e: (e["path"], e["pattern"], e["blob"]),
        )
        REGISTER_PATH.write_text(json.dumps({
            "note": "Historical credential exposures the owner has seen. Keyed by blob SHA; "
                    "holds no values. An entry here makes secret-scan.py warn instead of fail "
                    "for exactly those bytes. Rotation is still required — see docs/BLOCKERS.md.",
            "accepted": accepted,
        }, indent=2) + "\n")
        print(f"\nrecorded {len(accepted)} historical exposure(s) to {REGISTER_PATH.name}")
        return 0

    register = load_register()
    unregistered = {}
    if history_only:
        print("\nHISTORY ONLY — not in the current tree, so nothing to delete.")
        print("These cannot be un-leaked by a commit. ROTATE THEM.")
        for name, hits in history_only.items():
            paths = sorted({p for p, _, _, _ in hits})
            new = [h for h in hits if h[3] not in register]
            state = "known" if not new else f"{len(new)} UNREGISTERED"
            print(f"::warning::[{name}] {len(hits)} historical hit(s) in {', '.join(paths[:5])} ({state})")
            if new:
                unregistered[name] = new

    # An acceptance for bytes that no longer exist is a comment pretending to be a
    # review. It fails rather than lingering.
    seen_blobs = {b for hits in findings.values() for _, _, _, b in hits}
    stale = [b for b in register if b not in seen_blobs]

    if in_tree:
        print("\nRESULT: CREDENTIALS IN THE CURRENT TREE")
        for name, hits in in_tree.items():
            print(f"::error::[{name}] {len(hits)} hit(s)")
            for path, fragment, _, _ in sorted(set(hits))[:10]:
                print(f"   {path}  ~  {fragment}...")
        return 1

    if unregistered:
        print("\nRESULT: A CREDENTIAL WAS LEAKED THAT NOBODY HAS ACCEPTED")
        print("Removing it from the tree does not un-leak it. Rotate the credential, then")
        print("record the exposure with:  python3 scripts/secret-scan.py --record-exposures")
        for name, hits in unregistered.items():
            print(f"::error::[{name}] {len(hits)} unregistered historical hit(s)")
            for path, fragment, _, blob in sorted(set(hits))[:10]:
                print(f"   {path}  ~  {fragment}...  blob {blob[:12]}")
        return 1

    if stale:
        print("\nRESULT: THE EXPOSURE REGISTER IS STALE")
        print("These blobs are accepted but no longer match anything. Re-record the register.")
        for b in sorted(stale)[:10]:
            e = register[b]
            print(f"::error::[{e['pattern']}] stale acceptance for {e['path']}  blob {b[:12]}")
        return 1

    print("\nRESULT: current tree is clean")
    if history_only:
        print(f"        {sum(len(h) for h in history_only.values())} historical exposure(s), all on the register")
    return 0


if __name__ == "__main__":
    sys.exit(main())
