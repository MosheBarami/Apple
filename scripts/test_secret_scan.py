#!/usr/bin/env python3
"""Tests for the secret scanner — the control that decides whether a credential ships.

It had none. It gained a suppression mechanism (scripts/known-fixtures.json) the night the
build was red over sixteen files of fabricated test fixtures, and a suppression mechanism
with no test is exactly how a scanner becomes decoration.

EVERY TEST HERE IS A HOLE SOMEONE COULD DRIVE A REAL KEY THROUGH. The shape of each is:
build a throwaway git repository, put something credential-shaped in it, run the real
scanner as a subprocess, assert the exit code. Nothing is mocked, because the thing under
test is the exit code CI reads.

The two that carry the design are `test_new_secret_in_a_declared_file_still_fails` and
`test_declaration_does_not_travel_to_another_path`. If either goes green after a change
to the register's keying, the register has become a path exemption and the scanner is no
longer a control.

Run with:  python3 scripts/test_secret_scan.py
"""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SCANNER = pathlib.Path(__file__).resolve().parent / "secret-scan.py"

# Fabricated. Each is the alphabet or sequential digits behind a real vendor prefix, which
# is what every fixture in this repository looks like and why the scanner could not tell
# them from a leak without being told.
ANTHROPIC = "sk-ant-api03-" + "abcdefghijklmnopqrstuvwxyz0123"
AWS = "AKIA" + "ABCDEFGHIJKLMNOP"
GITHUB = "ghp_" + "abcdefghijklmnopqrstuvwxyz0123456789"


def sha256_of(value: str) -> str:
    import hashlib
    return hashlib.sha256(value.encode()).hexdigest()


class ScannerHarness(unittest.TestCase):
    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp(prefix="secret-scan-test-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        (self.root / "scripts").mkdir()
        # The scanner resolves both registers relative to its OWN location, so a copy of it
        # inside the temp repo is what isolates the test from this repository's registers.
        # It is deliberately never committed: an uncommitted file is not in `git rev-list`,
        # so the scanner cannot match its own pattern source and confuse the assertion.
        shutil.copy(SCANNER, self.root / "scripts" / "secret-scan.py")
        self.git("init", "-q")
        self.git("config", "user.email", "t@example.invalid")
        self.git("config", "user.name", "t")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, capture_output=True, check=True)

    def commit(self, path: str, body: str, message: str = "c"):
        f = self.root / path
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(body)
        self.git("add", "--", path)
        self.git("commit", "-q", "-m", message)

    def scan(self, *extra, env_extra=None):
        env = dict(os.environ)
        env.pop("CI", None)
        env.update(env_extra or {})
        return subprocess.run(
            ["python3", "scripts/secret-scan.py", *extra],
            cwd=self.root, capture_output=True, text=True, env=env,
        )

    def declare(self, entries):
        (self.root / "scripts" / "known-fixtures.json").write_text(json.dumps({
            "note": "test",
            "declared": [
                {"path": p, "pattern": pat, "value_sha256": sha256_of(v)}
                for p, pat, v in entries
            ],
        }))


class FixtureDeclarations(ScannerHarness):
    def test_an_undeclared_credential_in_the_tree_fails(self):
        """The control. Every other assertion here is meaningless if this one is not red."""
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("CREDENTIALS IN THE CURRENT TREE", r.stdout)

    def test_a_declared_fixture_passes(self):
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.declare([("tests/a.test.mjs", "Anthropic key", ANTHROPIC)])
        r = self.scan()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("declared fixtures matched", r.stdout)

    def test_new_secret_in_a_declared_file_still_fails(self):
        """THE ONE THAT MATTERS.

        A path exemption would pass this: the file is blessed, so anything inside it is
        invisible from then on. Keying by the value's hash means the second credential is
        a hash nobody declared, and the build stays red while the first fixture keeps
        working.
        """
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.declare([("tests/a.test.mjs", "Anthropic key", ANTHROPIC)])
        self.assertEqual(self.scan().returncode, 0)

        self.commit("tests/a.test.mjs",
                    f"const KEY = '{ANTHROPIC}';\nconst OOPS = '{AWS}';\n", "leak")
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("AWS access key id", r.stdout)

    def test_declaration_does_not_travel_to_another_path(self):
        """A fixture lifted out of tests/ into production source is a new finding.

        The second file's bytes differ deliberately. Identical bytes are ONE git blob, and
        that case is its own test below — mixing them made this pass on path ordering
        rather than on the rule it is named after.
        """
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.declare([("tests/a.test.mjs", "Anthropic key", ANTHROPIC)])
        self.assertEqual(self.scan().returncode, 0)

        self.commit("src/real.ts", f"export const KEY = '{ANTHROPIC}'; // shipped\n", "move it")
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("src/real.ts", r.stdout)
        self.assertIn("CREDENTIALS IN THE CURRENT TREE", r.stdout)

    def test_one_blob_at_two_paths_is_two_findings(self):
        """Git stores content once. Two files with identical bytes are one blob, and
        `git rev-list --objects` reports it under a single path — so a scanner that trusts
        that path lets a declared fixture cover an undeclared copy somewhere else.

        Both paths are declared here, so a scanner that sees both is clean and a scanner
        that sees one leaves the other declaration matching nothing. The assertion is
        order-independent, which the earlier version of this was not.
        """
        body = f"const KEY = '{ANTHROPIC}';\n"
        self.commit("tests/a.test.mjs", body)
        self.commit("src/copy.ts", body, "same bytes, second path")
        self.declare([
            ("tests/a.test.mjs", "Anthropic key", ANTHROPIC),
            ("src/copy.ts", "Anthropic key", ANTHROPIC),
        ])
        r = self.scan()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertNotIn("MATCHES NOTHING", r.stdout)

    def test_ordinary_edits_to_a_declared_file_do_not_churn_the_register(self):
        """The reason this is keyed by value and not by blob: a comment must not re-open
        a review. If this goes red the register churns on every commit, and a register
        that churns is a register people stop reading."""
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.declare([("tests/a.test.mjs", "Anthropic key", ANTHROPIC)])
        self.assertEqual(self.scan().returncode, 0)

        self.commit("tests/a.test.mjs",
                    f"// a new comment\nconst KEY = '{ANTHROPIC}';\n// and a new case\n", "edit")
        r = self.scan()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_a_declaration_that_matches_nothing_fails(self):
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.declare([
            ("tests/a.test.mjs", "Anthropic key", ANTHROPIC),
            ("tests/gone.test.mjs", "GitHub token", GITHUB),
        ])
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("FIXTURE DECLARATION MATCHES NOTHING", r.stdout)

    def test_a_declaration_that_matches_nothing_fails_alongside_history(self):
        """The same rule, reached by the other exit.

        The test above leaves the scanner with no findings at all, so it returns through
        the empty-findings branch. This one leaves a historical finding on the register's
        side of the fence, so the main branch runs. A mutation that disables either copy
        of the staleness check must be visible from here.
        """
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.commit("src/gone.ts", f"const K = '{AWS}';\n", "add")
        self.commit("src/gone.ts", "const K = process.env.K;\n", "remove")
        self.declare([
            ("tests/a.test.mjs", "Anthropic key", ANTHROPIC),
            ("tests/never-existed.test.mjs", "GitHub token", GITHUB),
        ])
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("FIXTURE DECLARATION MATCHES NOTHING", r.stdout)
        self.assertIn("never-existed", r.stdout)

    def test_a_fixture_that_leaves_the_tree_needs_the_explicit_flag(self):
        """Deleting a fixture file must not push anyone toward --record-exposures.

        The value is fabricated and there is nothing to rotate, so filing it in the
        exposure register would be a false label. It is declarable — but declaring
        something you cannot see in the working copy costs a second flag.
        """
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        self.commit("tests/a.test.mjs", "const KEY = process.env.KEY;\n", "drop the fixture")

        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("NOBODY HAS ACCEPTED", r.stdout)

        r = self.scan("--record-fixtures")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(self.scan().returncode, 1, "plain --record-fixtures must not reach history")

        r = self.scan("--record-fixtures", "--with-history")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("history only", r.stdout)
        self.assertEqual(self.scan().returncode, 0, self.scan().stdout)

    def test_a_real_accepted_exposure_is_never_recorded_as_a_fixture(self):
        """The two registers must not overlap, and the first --with-history run proved they
        would. known-exposures.json holds a real account password that lived in five infra
        scripts. Sweeping history would have re-filed it as "fabricated" behind a hash."""
        self.commit("infra/loadtest.mjs", f"const K = '{ANTHROPIC}';\n")
        blob = subprocess.run(
            ["git", "rev-parse", "HEAD:infra/loadtest.mjs"],
            cwd=self.root, capture_output=True, text=True, check=True).stdout.strip()
        self.commit("infra/loadtest.mjs", "const K = process.env.K;\n", "remove")
        (self.root / "scripts" / "known-exposures.json").write_text(json.dumps({
            "note": "test",
            "accepted": [{"blob": blob, "pattern": "Anthropic key", "path": "infra/loadtest.mjs"}],
        }))

        r = self.scan("--record-fixtures", "--with-history")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("on the exposure register", r.stdout)
        written = (self.root / "scripts" / "known-fixtures.json").read_text()
        self.assertNotIn(sha256_of(ANTHROPIC), written,
                         "an accepted real exposure was re-filed as a fixture")

    def test_a_declaration_covering_an_accepted_exposure_fails_the_scan(self):
        """Hand-written, inherited, or carried forward by --record-fixtures — however the line
        got there, a value on the exposure register cannot also be declared fabricated. The
        record-time guard alone could not fix a register that already held the bad line."""
        self.commit("infra/loadtest.mjs", f"const K = '{ANTHROPIC}';\n")
        blob = subprocess.run(
            ["git", "rev-parse", "HEAD:infra/loadtest.mjs"],
            cwd=self.root, capture_output=True, text=True, check=True).stdout.strip()
        (self.root / "scripts" / "known-exposures.json").write_text(json.dumps({
            "note": "test",
            "accepted": [{"blob": blob, "pattern": "Anthropic key", "path": "infra/loadtest.mjs"}],
        }))
        self.declare([("infra/loadtest.mjs", "Anthropic key", ANTHROPIC)])

        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("ON BOTH REGISTERS".title().upper()[:10], r.stdout.upper())
        self.assertIn("COVERS AN ACCEPTED REAL EXPOSURE", r.stdout)

    def test_recording_is_refused_in_ci(self):
        """A blessing minted by a robot is a rubber stamp."""
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        r = self.scan("--record-fixtures", env_extra={"CI": "true"})
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("not for CI", r.stdout)
        self.assertFalse((self.root / "scripts" / "known-fixtures.json").exists())

    def test_recording_then_scanning_is_clean_and_holds_no_values(self):
        self.commit("tests/a.test.mjs", f"const KEY = '{ANTHROPIC}';\n")
        r = self.scan("--record-fixtures")
        self.assertEqual(r.returncode, 0, r.stdout)
        written = (self.root / "scripts" / "known-fixtures.json").read_text()
        self.assertNotIn(ANTHROPIC, written, "the register must never hold the value itself")
        self.assertIn(sha256_of(ANTHROPIC), written)
        self.assertEqual(self.scan().returncode, 0)


class SuppressionBoundaries(ScannerHarness):
    def test_prose_near_a_hard_signature_cannot_talk_the_scanner_out_of_it(self):
        """The hole that cost before: ALLOW was applied to every rule and searched the
        surrounding bytes, so `# example` beside a real AWS key scanned clean."""
        self.commit("src/config.ts", f"// this is just an example, honestly\nconst K = '{AWS}';\n")
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("AWS access key id", r.stdout)

    def test_a_credential_removed_from_the_tree_is_still_a_leak(self):
        self.commit("src/config.ts", f"const K = '{AWS}';\n")
        self.commit("src/config.ts", "const K = process.env.K;\n", "remove it")
        r = self.scan()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("NOBODY HAS ACCEPTED", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
