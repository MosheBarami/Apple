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

DECLARED FIXTURES, and why this is not a path exemption. Sixteen test files feed the
redactor and the egress gate the very things they exist to catch — a JWT, an AWS access
key id, a Slack token — because a redactor tested on a clean string proves only that one
string survived. Every one of those values is fabricated, and every one is a
HARD_SIGNATURE that the ALLOW list below deliberately cannot suppress. So the scanner
failed on its own fixtures and the build stayed red.

The three available moves were: weaken the fixtures until they stop matching, which guts
the tests; exempt the paths, which is the standard way a scanner gets quietly neutered,
because from then on ANY credential dropped into an exempt file is invisible; or make a
fixture declare itself in a way a real leak cannot inherit.

The third is what is implemented, in scripts/known-fixtures.json. An entry is keyed by
(path, sha256 of the matched value) and holds no value bytes. That keying is the whole
control:

  - A NEW credential-shaped string in an ALREADY-DECLARED file is a new value hash, so it
    is not covered and the build fails. This is the case a path exemption cannot see, and
    it is the case that matters.
  - The SAME value in a different path is not covered either, so a fixture cannot be
    lifted out of tests/ into production source without a new, visible line.
  - Ordinary edits to a declared file — comments, new cases, refactors — do not disturb
    the entry, because the blob sha is not what is keyed. The register only churns when a
    credential-shaped literal actually changes, which is exactly when a human should look.
  - An entry that stops matching anything fails the run, like the exposure register above,
    so a declaration cannot outlive the fixture it describes.

WHAT IT STILL CANNOT DO, said plainly because the same caveat applies to the register
above: it is an ALLOWLIST, not an attestation. Anyone who can commit can add a line
blessing a real credential. The control is that the line is in the diff and the build
blocks until someone writes it. The tool makes a new credential-shaped string a
REVIEWABLE EVENT; it cannot tell whether the review happened. `--record-fixtures` refuses
to run when CI is set in the environment, so a blessing can never be minted by a robot.

Record the current state after rotating with:  secret-scan.py --record-exposures
Declare the current in-tree fixtures with:     secret-scan.py --record-fixtures
Include fixtures that survive only in history:  ... --record-fixtures --with-history
"""
from __future__ import annotations

import base64
import collections
import hashlib
import json
import os
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
    #   A PEM HEADER IS NOT A KEY. This used to match the header alone, so any prose
    #   quoting one — including this file's own comments, which is how it was found —
    #   was a hit, and because this rule is a HARD_SIGNATURE that ALLOW cannot suppress,
    #   there was no way to write about it. A real key is always followed by its base64
    #   body, so requiring 40+ characters of one keeps every genuine leak and drops the
    #   examples. Not an evasion path: a key with no body decrypts nothing.
    ("Private key block",
     re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----[\r\n\s]+[A-Za-z0-9+/=\r\n\s]{40,}")),
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

# Fabricated, credential-shaped strings a test feeds to the thing that is supposed to catch
# them. Keyed by (path, sha256 of the matched value); holds no value bytes. See the module
# docstring for why this is keyed by value rather than by path or by blob.
FIXTURES_PATH = pathlib.Path(__file__).resolve().parent / "known-fixtures.json"


def load_register() -> dict:
    if not REGISTER_PATH.exists():
        return {}
    data = json.loads(REGISTER_PATH.read_text())
    return {e["blob"]: e for e in data.get("accepted", [])}


def load_fixtures() -> dict:
    """Declared fixtures, keyed by (path, value sha256)."""
    if not FIXTURES_PATH.exists():
        return {}
    data = json.loads(FIXTURES_PATH.read_text())
    return {(e["path"], e["value_sha256"]): e for e in data.get("declared", [])}


def report_stale_fixtures(fixtures: dict, matched: set) -> bool:
    """True (and printed) if any declaration matched nothing on any ref.

    ONE implementation, called from both exits. There were two copies for a while — the
    empty-findings branch and the main one — and a mutation that disabled the main copy
    left every stale test green, because the only test covering it happened to reach the
    other branch. Two copies of a check are one check and one blind spot.
    """
    stale = [k for k in fixtures if k not in matched]
    if not stale:
        return False
    print("\nRESULT: A FIXTURE DECLARATION MATCHES NOTHING")
    print("A declaration that outlives its fixture is a comment pretending to be a review.")
    print("Re-declare with:  python3 scripts/secret-scan.py --record-fixtures")
    for pth, vsha in sorted(stale)[:10]:
        e = fixtures[(pth, vsha)]
        print(f"::error::[{e['pattern']}] stale fixture declaration for {pth}  value {vsha[:12]}")
    return True


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


def head_blobs() -> dict[str, list[str]]:
    """Blob shas in the current commit, each mapped to EVERY path it occupies.

    Not a set of shas. Git stores content once, so two files with identical bytes are one
    blob, and `git rev-list --objects` then reports that blob under ONE of its paths —
    whichever it walked first. Keying an exemption by path while reading the path from
    rev-list therefore lets a fixture duplicated into production source be reported under
    the test path and inherit the test's declaration. Found by
    test_declaration_does_not_travel_to_another_path, which went green for the wrong
    reason until this returned every path.
    """
    out = sh("git", "ls-tree", "-r", "HEAD", "--format=%(objectname) %(path)")
    paths: dict[str, list[str]] = collections.defaultdict(list)
    for line in out.splitlines():
        sha, _, path = line.partition(b" ")
        if path:
            paths[sha.decode()].append(path.decode("utf8", "replace"))
    return paths


def main() -> int:
    # A credential in an old commit cannot be un-leaked by a later commit — the
    # only real remedy is rotating it. So findings are split: anything present
    # in the CURRENT tree fails the build, because that is fixable by editing a
    # file; anything that survives only in history is reported loudly as a
    # rotation task but does not hold the build hostage forever.
    live = head_blobs()
    fixtures = load_fixtures()
    objects = sh("git", "rev-list", "--all", "--objects").splitlines()
    findings: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    declared: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    matched_fixtures: set[tuple[str, str]] = set()
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
                value_sha = hashlib.sha256(value).hexdigest()
                in_tree_paths = live.get(sha.decode())
                # One hit per path the blob occupies in HEAD; falling back to rev-list's
                # single path only for a blob that is history-only. See head_blobs().
                for text_path in (in_tree_paths or [path.decode("utf8", "replace")]):
                    hit = (
                        text_path,
                        value[:16].decode("utf8", "replace"),
                        bool(in_tree_paths),
                        sha.decode(),
                        value_sha,
                    )
                    # A declared fixture is reported, never failed on. The key is the VALUE
                    # at that PATH, so a different credential in the same file is still a
                    # finding, and the same value at a new path is a finding too.
                    if (text_path, value_sha) in fixtures:
                        matched_fixtures.add((text_path, value_sha))
                        declared[name].append(hit)
                        continue
                    findings[name].append(hit)

    print(f"blobs scanned across full history: {scanned}")

    if declared:
        n = sum(len(h) for h in declared.values())
        paths = sorted({p for hits in declared.values() for p, _, _, _, _ in hits})
        print(f"declared fixtures matched: {n} hit(s) in {len(paths)} file(s) "
              f"(scripts/{FIXTURES_PATH.name})")

    if "--record-fixtures" in sys.argv:
        # A blessing is a human act. A robot that can mint one turns the register from a
        # reviewable event into a rubber stamp, so CI is refused outright.
        if os.environ.get("CI"):
            print("\nREFUSING TO RECORD: --record-fixtures is not for CI.")
            print("A declaration is a claim that a value is fabricated. Make it locally,")
            print("commit it, and let the reviewer see the line.")
            return 1
        #[[ IN-TREE BY DEFAULT, HISTORY ONLY WHEN ASKED.
        #
        #   A fixture file that is deleted, renamed, or rewritten leaves its fabricated value
        #   behind in history, where the scanner's rule is "an unaccepted historical credential
        #   fails until someone rotates it". For a fabricated value there is nothing to rotate,
        #   and the only remedy on offer would be --record-exposures, which files it in
        #   known-exposures.json under the words "pending rotation". That is a false label, and
        #   filing a false label to turn a build green is how a register stops meaning anything.
        #   Rewriting docs/GO-LIVE.md produced exactly this case within the hour.
        #
        #   So a declaration covers the value at that path whether it is in the tree or only in
        #   history — the fixture check above does not consult liveness — but RECORDING one that
        #   is not in the tree takes a second, deliberate flag. Blessing something you cannot
        #   currently see should cost a keystroke and print a list. ]]
        with_history = "--with-history" in sys.argv
        rows = sorted(
            ({"path": p, "pattern": n, "value_sha256": v, "in_tree": in_tree}
             for n, hits in findings.items() for p, _, in_tree, _, v in hits
             if in_tree or with_history),
            key=lambda e: (e["path"], e["pattern"], e["value_sha256"]),
        )
        buried = [e for e in rows if not e["in_tree"]]
        rows = [{k: v for k, v in e.items() if k != "in_tree"} for e in rows]
        seen, fresh = set(), []
        for r in rows:
            key = (r["path"], r["value_sha256"])
            if key in seen:
                continue
            seen.add(key)
            fresh.append(r)
        kept = [e for (pth, vsha), e in sorted(fixtures.items()) if (pth, vsha) in matched_fixtures]
        merged = sorted(
            {(e["path"], e["pattern"], e["value_sha256"]) for e in kept + fresh},
        )
        FIXTURES_PATH.write_text(json.dumps({
            "note": "Fabricated, credential-shaped strings that a test feeds to the thing "
                    "meant to catch them. Keyed by (path, sha256 of the matched value); "
                    "holds no value bytes. A NEW credential-shaped string in one of these "
                    "files is a new hash and still fails the build \u2014 this is a value "
                    "declaration, not a path exemption. Every line here is a human claim "
                    "that the value is not real; the control is that it is in the diff.",
            "declared": [
                {"path": a, "pattern": b, "value_sha256": c} for a, b, c in merged
            ],
        }, indent=2) + "\n")
        print(f"\ndeclared {len(merged)} fixture(s) in {FIXTURES_PATH.name}")
        for a, b, _ in merged:
            print(f"   [{b}] {a}")
        if buried:
            print(f"\n{len(buried)} of these are NOT in the current tree. You are declaring that a")
            print("value you cannot see in the working copy was fabricated. Check each one:")
            for e in sorted({(e["path"], e["pattern"]) for e in buried}):
                print(f"   [{e[1]}] {e[0]}   (history only)")
        print("\nCOMMIT THIS FILE. Each line is a claim that the value is fabricated.")
        return 0
    if not findings:
        if "--record-fixtures" not in sys.argv and report_stale_fixtures(fixtures, matched_fixtures):
            return 1
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
             for p, _, _, b, _ in hits),
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
            paths = sorted({p for p, _, _, _, _ in hits})
            new = [h for h in hits if h[3] not in register]
            state = "known" if not new else f"{len(new)} UNREGISTERED"
            print(f"::warning::[{name}] {len(hits)} historical hit(s) in {', '.join(paths[:5])} ({state})")
            if new:
                unregistered[name] = new

    # An acceptance for bytes that no longer exist is a comment pretending to be a
    # review. It fails rather than lingering.
    seen_blobs = {b for hits in findings.values() for _, _, _, b, _ in hits}
    stale = [b for b in register if b not in seen_blobs]

    if in_tree:
        print("\nRESULT: CREDENTIALS IN THE CURRENT TREE")
        for name, hits in in_tree.items():
            print(f"::error::[{name}] {len(hits)} hit(s)")
            for path, fragment, _, _, _ in sorted(set(hits))[:10]:
                print(f"   {path}  ~  {fragment}...")
        return 1

    if report_stale_fixtures(fixtures, matched_fixtures):
        return 1

    if unregistered:
        print("\nRESULT: A CREDENTIAL WAS LEAKED THAT NOBODY HAS ACCEPTED")
        print("Removing it from the tree does not un-leak it. Rotate the credential, then")
        print("record the exposure with:  python3 scripts/secret-scan.py --record-exposures")
        for name, hits in unregistered.items():
            print(f"::error::[{name}] {len(hits)} unregistered historical hit(s)")
            for path, fragment, _, blob, _ in sorted(set(hits))[:10]:
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
