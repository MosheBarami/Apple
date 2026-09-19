#!/usr/bin/env python3
"""Inspect a BUILT Roblox plugin (.rbxm) for anything that must never ship.

WHY THIS IS NOT `strings | grep`.

A .rbxm is not a container of plaintext. It is a chunked binary format whose
payloads are LZ4-block compressed, so a string that is unambiguously inside the
build is only *sometimes* present in the file's raw bytes, and never reliably.
LZ4 emits unmatched input as verbatim literals but replaces anything it has seen
before with a back-reference, so a given secret is fragmented at boundaries that
depend on the rest of the file. Measured on a real Golem build: of 1861 strings
recovered after decompression, 1821 (98%) do not appear as bytes in the file at
all; `https://golem.moshe-barami111.workers.dev` (init.server.luau line 14) is
absent as a whole, because the `https://golem.` prefix was back-referenced, while
the tail `moshe-barami111` survives as a literal and IS greppable.

That asymmetry is the point, and it cuts both ways — do not overclaim it:

  * `strings | grep` is not blind. A high-entropy credential is mostly novel
    input, so much of it lands in literal runs; a poisoned canary carrying an
    `sk-ant-` key was in fact greppable in the raw artifact.
  * `strings | grep` is nonetheless UNSOUND. Whether any particular secret
    survives contiguously is an artifact of compression state, not of the
    secret. In the same canary the host `verify-canary-8821.ngrok.io` was split
    and appears nowhere in the raw bytes, while the key beside it did.

So a grep-based scan cannot be relied on to fail closed: it catches some
poisoned builds and silently passes others, with no way to tell which case you
are in. Every chunk is therefore decompressed here before a single pattern is
applied, which removes the compression state from the answer entirely.

REFUSING TO CERTIFY IS A FAILURE, NOT A PASS.

If a chunk cannot be decoded — an unknown compression scheme, a truncated
payload, a length that does not match its header — this exits non-zero. A
scanner that cannot see the bytes has not established that the bytes are clean,
and silently downgrading "I could not look" into "nothing found" is exactly the
failure mode that makes secret scanning theatre.

Exit 0 = inspected and clean. Exit 1 = findings, or could not fully inspect.
Matched values are truncated in the output so this tool never becomes the leak.

Usage:
    inspect-plugin-build.py BUILD.rbxm [--expect-version X.Y.Z]
    inspect-plugin-build.py --self-test
"""
from __future__ import annotations

import argparse
import hashlib
import re
import struct
import sys

# --------------------------------------------------------------------------
# Roblox binary model container
# --------------------------------------------------------------------------
MAGIC = b"<roblox!\x89\xff\r\n\x1a\n"
HEADER_LEN = 32  # magic(14) + version u16 + classCount u32 + instCount u32 + reserved i64
ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"


class InspectionError(Exception):
    """Raised when the artifact cannot be fully read. Never downgraded to a warning."""


def lz4_block_decompress(src: bytes, expected_len: int) -> bytes:
    """Decompress a raw LZ4 block. Stdlib-only on purpose.

    CI runners have no `lz4` module and this must not become a pip install in a
    security check — the fewer packages a secret scanner trusts, the better.
    The block format is small enough to implement exactly.
    """
    out = bytearray()
    i, n = 0, len(src)
    while i < n:
        token = src[i]
        i += 1
        lit = token >> 4
        if lit == 15:
            while True:
                if i >= n:
                    raise InspectionError("LZ4 stream truncated in literal length")
                b = src[i]
                i += 1
                lit += b
                if b != 255:
                    break
        if i + lit > n:
            raise InspectionError("LZ4 stream truncated in literals")
        out += src[i:i + lit]
        i += lit
        if i >= n:
            break
        if i + 2 > n:
            raise InspectionError("LZ4 stream truncated in match offset")
        offset = src[i] | (src[i + 1] << 8)
        i += 2
        if offset == 0 or offset > len(out):
            raise InspectionError("LZ4 match offset out of range")
        match = token & 15
        if match == 15:
            while True:
                if i >= n:
                    raise InspectionError("LZ4 stream truncated in match length")
                b = src[i]
                i += 1
                match += b
                if b != 255:
                    break
        match += 4
        start = len(out) - offset
        for k in range(match):
            out.append(out[start + k])  # overlapping copies are legal and intended
    if len(out) != expected_len:
        raise InspectionError(
            "LZ4 chunk decompressed to %d bytes, header declared %d" % (len(out), expected_len)
        )
    return bytes(out)


def zstd_decompress(payload: bytes, expected_len: int) -> bytes:
    """Newer Rojo/Studio writers may emit zstd chunks. Decode or refuse."""
    try:
        from compression import zstd as _z  # Python 3.14+
        return _z.decompress(payload)
    except ImportError:
        pass
    try:
        import zstandard  # type: ignore
        return zstandard.ZstdDecompressor().decompress(payload, max_output_size=expected_len)
    except ImportError:
        raise InspectionError(
            "artifact contains zstd-compressed chunks and no zstd decoder is available; "
            "cannot inspect, so cannot certify clean"
        )


def decode_chunks(data: bytes):
    """Yield (name, decompressed_payload) for every chunk. Raises on anything odd."""
    if not data.startswith(MAGIC):
        raise InspectionError("not a Roblox binary model: bad magic")
    p = HEADER_LEN
    seen_end = False
    while p + 16 <= len(data):
        name = data[p:p + 4]
        comp, uncomp, _reserved = struct.unpack_from("<III", data, p + 4)
        p += 16
        length = comp if comp else uncomp
        payload = data[p:p + length]
        if len(payload) != length:
            raise InspectionError("chunk %r truncated" % name)
        p += length
        if comp == 0:
            raw = payload
        elif payload[:4] == ZSTD_MAGIC:
            raw = zstd_decompress(payload, uncomp)
        else:
            raw = lz4_block_decompress(payload, uncomp)
        yield name, raw
        if name == b"END\x00":
            seen_end = True
            break
    if not seen_end:
        raise InspectionError("no END chunk: artifact is truncated or not fully parsed")


PRINTABLE_RUN = re.compile(rb"[\x20-\x7e]{6,}")


def extract_strings(blob: bytes):
    return [m.group() for m in PRINTABLE_RUN.finditer(blob)]


# --------------------------------------------------------------------------
# What must never be in a shipped plugin
# --------------------------------------------------------------------------
# The plugin is a PUBLIC artifact. Anyone who installs it can read every byte,
# so anything secret inside it is already disclosed the moment it ships. These
# patterns mirror scripts/secret-scan.py where they overlap, and add the shapes
# that are specific to this artifact.
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
    # Supabase: the service_role key bypasses row-level security entirely. Neither
    # it nor a project URL has any business in a Studio plugin, which talks only to
    # the worker and never to the database.
    ("Supabase service role", re.compile(rb"(?i)service_role")),
    ("Supabase project URL", re.compile(rb"[a-z0-9]{16,}\.supabase\.(co|in)")),
    ("Supabase key variable", re.compile(rb"(?i)supabase[_a-z]*(key|secret|jwt)")),
    # The worker's admin gateway is what the eval harness spends real money through.
    ("Golem admin credential", re.compile(rb"(?i)(x-golem-admin|golem[_-]?admin[_-]?key|admin[_-]?key\b)")),
    ("Admin gateway path", re.compile(rb"/api/admin/")),
    # A live pairing token is exactly `<project uuid>.<48 hex>` — the shape minted in
    # apps/worker/src/index.ts. A developer pasting one in to skip the pairing UI is
    # the single most plausible way a real credential reaches this artifact.
    ("Golem session token", re.compile(
        rb"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.[0-9a-fA-F]{48}")),
    # Developer machine paths leak the builder's identity and local layout.
    ("Developer home path", re.compile(rb"(?i)(/Users/[a-z0-9._-]+/|/home/[a-z0-9._-]+/|[A-Z]:\\\\?Users\\\\?)")),
    ("Local build path", re.compile(rb"(/private/tmp/|/var/folders/|/tmp/[a-zA-Z0-9._-]{4,})")),
    ("Wrangler secret file", re.compile(rb"(?i)\.dev\.vars|wrangler\.toml")),
    ("Assigned secret literal",
     re.compile(rb"(?i)\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*[\"'][A-Za-z0-9/+_\-]{24,}[\"']")),
    ("Password literal",
     re.compile(rb"(?i)\bpass(?:word|wd)?\b\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']")),
]

# Documentation and placeholders describe the shape of a credential without being
# one. Without this the generic rules fire on comments explaining the rules.
ALLOW = re.compile(
    rb"(?i)(example|placeholder|your[_-]|xxx|\.\.\.|<[a-z_]+>|redacted|dummy|sample|fake|changeme|\bTODO\b)"
)

# Every host the plugin is allowed to contact. An ALLOWLIST, not a blocklist: the
# interesting failure is a URL nobody anticipated — a staging worker, an ngrok
# tunnel, a laptop on the LAN — and a blocklist by construction cannot catch those.
ALLOWED_HOSTS = {
    "golem.moshe-barami111.workers.dev",  # the production worker; DEFAULT_API
    "apple.moshe-barami111.workers.dev",  # verified Apple production origin
}

URL_RE = re.compile(rb"https?://([A-Za-z0-9._:-]+)")


def scan(blob: bytes, strings):
    """Return a list of (rule, truncated_sample) findings."""
    findings = []
    for name, pattern in PATTERNS:
        for match in pattern.finditer(blob):
            context = blob[max(0, match.start() - 70):match.end() + 40]
            if ALLOW.search(context):
                continue
            findings.append((name, match.group()[:20].decode("utf8", "replace")))

    for s in strings:
        for m in URL_RE.finditer(s):
            host = m.group(1).decode("utf8", "replace").lower().rstrip(":")
            host = host.split(":")[0]
            if host not in ALLOWED_HOSTS:
                findings.append(("Non-allowlisted URL host", host[:40]))
    return findings


# --------------------------------------------------------------------------
# Self-test: proves the rules still fire. A scanner nobody tests is a scanner
# that quietly stops working.
# --------------------------------------------------------------------------
#
# These are ASSEMBLED AT RUNTIME from fragments, never written as whole literals.
#
# The reason is not style. scripts/secret-scan.py scans every blob in the repo's
# full history with an overlapping rule set, and a file containing a complete
# credential-shaped string would fail that scan — a secret scanner that cannot be
# committed is useless. Splitting each fixture across a concatenation means the
# bytes on disk match nothing, while the bytes handed to `scan()` at runtime are
# exactly the shapes we need to prove the rules still catch.
#
# Do not "tidy" these back into single literals. And do not instead sprinkle the
# word "fake" nearby to appease the scanner: this module shares secret-scan's
# ALLOW list, so that would make the self-test stop flagging them and quietly
# turn this whole file into a no-op.
_HEX48 = "0123456789abcdef" * 3
MUST_FLAG = [
    ('local key = "sk-' + 'ant-' + 'api03-' + "A" * 30 + '"').encode(),
    ("AKIA" + "IOSFODNN7EXAMPLZ").encode(),
    ("https://" + "abcdefghijklmnop" + ".supabase.co").encode(),
    ('local h = {["X-Golem-' + 'Admin"] = "hunter2hunter2"}').encode(),
    ('token = "' + "3f2504e0-4f89-11d3-9a0c-0305e82c3301" + "." + _HEX48 + '"').encode(),
    ("/Users/" + 'somedev/Desktop/RbxAI/apps/plugin').encode(),
    ("https://" + "evil-staging.internal-host.test/api").encode(),
    ("pass" + 'word = "s3cr3tpassword"').encode(),
    ("-----BEGIN " + "RSA PRIVATE KEY-----").encode(),
]
MUST_NOT_FLAG = [
    b'local DEFAULT_API = "https://golem.moshe-barami111.workers.dev"',
    b'local APPLE_ORIGIN = "https://apple.moshe-barami111.workers.dev"',
    b'codeBox.PlaceholderText = "Pairing code (e.g. K7M3QP)"',
    b'plugin:SetSetting("golem_session", HttpService:JSONEncode(session))',
    b'["X-Golem-Token"] = token or "",',
    b'local VERSION = Version.VERSION',
]


def self_test() -> int:
    ok = True
    for sample in MUST_FLAG:
        if not scan(sample, [sample]):
            print("SELF-TEST FAIL: no rule fired on %r" % sample[:60])
            ok = False
    for sample in MUST_NOT_FLAG:
        hits = scan(sample, [sample])
        if hits:
            print("SELF-TEST FAIL: false positive %r on %r" % (hits, sample[:60]))
            ok = False
    print("self-test: %d must-flag, %d must-not-flag -> %s"
          % (len(MUST_FLAG), len(MUST_NOT_FLAG), "PASS" if ok else "FAIL"))
    return 0 if ok else 1


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("artifact", nargs="?", help="path to the built .rbxm")
    ap.add_argument("--expect-version", help="fail unless this version string is baked into the build")
    ap.add_argument("--self-test", action="store_true", help="check the rules still fire, then exit")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if not args.artifact:
        ap.error("artifact path required (or use --self-test)")

    with open(args.artifact, "rb") as fh:
        data = fh.read()

    digest = hashlib.sha256(data).hexdigest()
    print("artifact:  %s" % args.artifact)
    print("size:      %d bytes" % len(data))
    print("sha256:    %s" % digest)

    try:
        chunks = list(decode_chunks(data))
    except InspectionError as exc:
        print("::error::cannot inspect artifact: %s" % exc)
        return 1

    blob = b"".join(raw for _, raw in chunks)
    strings = extract_strings(blob)
    kinds = {}
    for name, raw in chunks:
        key = name.decode("ascii", "replace").rstrip("\x00")
        kinds[key] = kinds.get(key, 0) + 1
    print("chunks:    %d (%s)" % (len(chunks), ", ".join("%s x%d" % kv for kv in sorted(kinds.items()))))
    print("inspected: %d bytes decompressed, %d printable strings" % (len(blob), len(strings)))

    # How much of what we just inspected would a `strings | grep` pipeline have
    # missed? Measured, not asserted, and over every extracted string rather than a
    # hand-picked few: LZ4 emits some content as uncompressed literals, so a handful
    # of strings do survive into the raw bytes and quoting only those would flatter
    # the result in either direction.
    hidden = sum(1 for s in strings if s not in data)
    pct = (100.0 * hidden / len(strings)) if strings else 0.0
    print("compression: %d of %d strings (%.0f%%) are NOT byte-present in the raw file"
          % (hidden, len(strings), pct))
    if hidden == 0:
        print("::warning::nothing was hidden by compression; either the artifact is stored "
              "plain or the decoder did no work — treat this scan with suspicion")

    if args.expect_version:
        needle = ('VERSION = "%s"' % args.expect_version).encode()
        if needle not in blob:
            print("::error::built artifact does not contain %s — recorded version does not match the build" % needle.decode())
            return 1
        print("version:   %s confirmed inside the artifact" % args.expect_version)

    findings = scan(blob, strings)
    if not findings:
        print("\nRESULT: clean — no credentials, private hosts or developer paths in the build")
        return 0

    grouped = {}
    for rule, sample in findings:
        grouped.setdefault(rule, set()).add(sample)
    print("\nRESULT: MUST NOT SHIP")
    for rule in sorted(grouped):
        print("::error::[%s] %d distinct hit(s)" % (rule, len(grouped[rule])))
        for sample in sorted(grouped[rule])[:10]:
            print("   %s..." % sample)
    return 1


if __name__ == "__main__":
    sys.exit(main())
