"""The Python client, against a real HTTP server.

Same discipline as the JavaScript suite: the interesting inputs are the malformed ones,
and they come FROM THE TEST. A mocked ``urlopen`` would agree with whatever the client
did; a real socket does not.

Run:  python3 -m unittest discover -s tests -t .      (from packages/sdk/python)
"""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from golem_sdk import (  # noqa: E402
    ApiError,
    AppleClient,
    StudioClient,
    StudioSessionEnded,
    backoff_seconds,
    finite_number,
    is_finite_number,
    is_project_id,
    is_studio_token,
    poll_wait_seconds,
    project_path,
    should_retry,
)

PROJECT = "3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f1234"
SECRET = "a" * 48
TOKEN = "{}.{}".format(PROJECT, SECRET)


class _Handler(BaseHTTPRequestHandler):
    routes = {}
    requests = []
    hits = {}

    def log_message(self, *args):  # keep the test output readable
        pass

    def _serve(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        path, _, query = self.path.partition("?")
        key = "{} {}".format(self.command, path)
        record = {"method": self.command, "path": path, "query": query,
                  "headers": dict(self.headers), "body": raw}
        type(self).requests.append(record)
        handler = type(self).routes.get(key)
        if handler is None:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "no route for " + key}).encode())
            return
        n = type(self).hits.get(key, 0) + 1
        type(self).hits[key] = n
        out = handler(record, n) or {}
        body = out.get("body", {"ok": True})
        payload = body.encode("utf-8") if isinstance(body, str) else json.dumps(body).encode("utf-8")
        self.send_response(out.get("status", 200))
        for k, v in (out.get("headers") or {"Content-Type": "application/json"}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET = _serve
    do_POST = _serve
    do_PUT = _serve


class ServerCase(unittest.TestCase):
    def serve(self, routes):
        handler = type("H", (_Handler,), {"routes": routes, "requests": [], "hits": {}})
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return "http://127.0.0.1:{}".format(server.server_address[1]), handler


class TestNumbers(unittest.TestCase):
    def test_is_finite_number_rejects_what_or_would_accept(self):
        for bad in (float("nan"), float("inf"), "12", "", None, {}, [], True, False):
            self.assertFalse(is_finite_number(bad), "{!r} counted as a number".format(bad))
        for good in (0, -1, 1.5, 10 ** 9):
            self.assertTrue(is_finite_number(good))

    def test_finite_number_keeps_a_real_zero(self):
        # `value or fallback` replaces a legitimate zero. This must not.
        self.assertEqual(finite_number(0, 2000), 0)
        self.assertEqual(finite_number(float("nan"), 2000), 2000)
        self.assertEqual(finite_number("5000", 2000), 2000)

    def test_finite_number_clamps_within_range(self):
        for v in (-(10 ** 9), -1, 0, 250, 9999, 10 ** 9):
            out = finite_number(v, 2000, 200, 10000)
            self.assertTrue(200 <= out <= 10000, "{} escaped the range".format(v))


class TestRetryPolicy(unittest.TestCase):
    def test_post_is_not_retried_by_default(self):
        self.assertTrue(should_retry("GET", 503, 1, 3))
        self.assertFalse(should_retry("POST", 503, 1, 3))
        self.assertTrue(should_retry("POST", 503, 1, 3, retry_non_idempotent=True))

    def test_a_permanent_status_is_not_retried(self):
        for status in (400, 401, 403, 404, 409, 422):
            self.assertFalse(should_retry("GET", status, 1, 5), str(status))

    def test_an_unreadable_counter_refuses_rather_than_restarting(self):
        self.assertFalse(should_retry("GET", 500, float("nan"), 3))
        self.assertFalse(should_retry("GET", 500, float("inf"), 3))
        self.assertFalse(should_retry("GET", 500, 3, 3))

    def test_backoff_grows_and_is_capped(self):
        schedule = [backoff_seconds(n, jitter=lambda: 1.0) for n in range(1, 9)]
        for i in range(1, len(schedule)):
            self.assertGreaterEqual(schedule[i], schedule[i - 1])
        self.assertAlmostEqual(schedule[1], schedule[0] * 2)
        self.assertLessEqual(schedule[-1], 20.0)
        # The server's own instruction wins over the client's schedule.
        self.assertEqual(backoff_seconds(1, retry_after=2), 2.0)
        self.assertEqual(backoff_seconds(1, retry_after=45), 20.0)


class TestPaths(unittest.TestCase):
    def test_a_non_uuid_project_id_is_refused(self):
        self.assertTrue(is_project_id(PROJECT))
        for evil in ("../../admin/stats", "not-a-uuid", "", None, 42):
            with self.assertRaises(ValueError, msg="{!r} was accepted".format(evil)):
                project_path(evil, "/messages")

    def test_the_documented_path_is_built(self):
        self.assertEqual(project_path(PROJECT, "/messages"), "/api/projects/{}/messages".format(PROJECT))


class TestClient(ServerCase):
    def test_the_bearer_token_rides_on_authed_calls_only(self):
        base, h = self.serve({
            "GET /api/me": lambda req, n: {"body": {"userId": "u1"}},
            "GET /api/health": lambda req, n: {"body": {"ok": True}},
        })
        client = AppleClient(base_url=base, token="jwt-abc")
        self.assertEqual(client.me()["userId"], "u1")
        self.assertEqual(h.requests[-1]["headers"].get("Authorization"), "Bearer jwt-abc")
        client.health()
        self.assertIsNone(h.requests[-1]["headers"].get("Authorization"))

    def test_a_callable_token_is_resolved_per_request(self):
        base, h = self.serve({"GET /api/me": lambda req, n: {"body": {"ok": True}}})
        counter = {"n": 0}

        def token():
            counter["n"] += 1
            return "jwt-{}".format(counter["n"])

        client = AppleClient(base_url=base, token=token)
        client.me()
        client.me()
        self.assertEqual(h.requests[0]["headers"]["Authorization"], "Bearer jwt-1")
        self.assertEqual(h.requests[1]["headers"]["Authorization"], "Bearer jwt-2")

    def test_a_429_that_clears_is_retried(self):
        base, h = self.serve({
            "GET /api/me": lambda req, n: ({"status": 429, "body": {"error": "slow down"}}
                                           if n < 3 else {"body": {"userId": "u1"}}),
        })
        client = AppleClient(base_url=base, token="x", sleep=lambda s: None)
        self.assertEqual(client.me()["userId"], "u1")
        self.assertEqual(len(h.requests), 3)

    def test_an_error_carries_the_servers_own_sentence(self):
        base, _ = self.serve({
            "GET /api/docs/search": lambda req, n: {"status": 429, "body": {"error": "Daily Sparks used up"}},
        })
        client = AppleClient(base_url=base, token="x", sleep=lambda s: None, max_attempts=2)
        with self.assertRaises(ApiError) as caught:
            client.search_docs("humanoid")
        self.assertEqual(caught.exception.status, 429)
        self.assertEqual(caught.exception.message, "Daily Sparks used up")
        self.assertEqual(caught.exception.attempts, 2)

    def test_a_post_is_not_repeated_by_a_503(self):
        base, h = self.serve({
            "POST /api/projects/{}/checkpoints".format(PROJECT): lambda req, n: {"status": 503, "body": {"error": "down"}},
        })
        client = AppleClient(base_url=base, token="x", sleep=lambda s: None, max_attempts=5)
        with self.assertRaises(ApiError):
            client.create_checkpoint(PROJECT, "a")
        self.assertEqual(len(h.requests), 1, "exactly one checkpoint attempt reached the server")

    def test_an_html_error_body_does_not_become_a_json_decode_error(self):
        base, _ = self.serve({
            "GET /api/me": lambda req, n: {"status": 502, "headers": {"Content-Type": "text/html"},
                                           "body": "<html>502 Bad Gateway</html>"},
        })
        client = AppleClient(base_url=base, token="x", sleep=lambda s: None, max_attempts=1)
        with self.assertRaises(ApiError) as caught:
            client.me()
        self.assertEqual(caught.exception.status, 502)
        self.assertIn("502", caught.exception.message)

    def test_an_unreachable_server_is_a_transport_error_not_a_status(self):
        client = AppleClient(base_url="http://127.0.0.1:1", token=None, sleep=lambda s: None, max_attempts=2)
        with self.assertRaises(ApiError) as caught:
            client.health()
        self.assertEqual(caught.exception.status, 0)
        self.assertTrue(caught.exception.is_transport)

    def test_an_unknown_plan_never_reaches_checkout(self):
        base, h = self.serve({"POST /api/billing/checkout": lambda req, n: {"body": {"url": "https://stripe.test/x"}}})
        client = AppleClient(base_url=base, token="x")
        for bad in ("pro", "team", "", None):
            with self.assertRaises(ValueError, msg="{!r} was accepted".format(bad)):
                client.start_checkout(bad)
        self.assertEqual(len(h.requests), 0)
        self.assertEqual(client.start_checkout("studio")["url"], "https://stripe.test/x")

    def test_save_memory_refuses_a_patch_and_sends_the_whole_memory(self):
        base, h = self.serve({
            "PUT /api/projects/{}/memory".format(PROJECT): lambda req, n: {"body": {"memory": {}, "editedAt": None}},
        })
        client = AppleClient(base_url=base, token="x")
        with self.assertRaises(ValueError):
            client.save_memory(PROJECT, {"summary": "x"})
        self.assertEqual(len(h.requests), 0)
        client.save_memory(PROJECT, {"summary": "a tower", "facts": ["door is red"]})
        self.assertEqual(json.loads(h.requests[-1]["body"])["memory"]["facts"], ["door is red"])

    def test_export_keeps_the_filename_the_server_chose(self):
        base, _ = self.serve({
            "GET /api/projects/{}/export".format(PROJECT): lambda req, n: {
                "headers": {"Content-Type": "text/markdown",
                            "Content-Disposition": 'attachment; filename="tower-2026.md"'},
                "body": "# tower\n",
            },
        })
        client = AppleClient(base_url=base, token="x")
        out = client.export_transcript(PROJECT, "md")
        self.assertEqual(out["filename"], "tower-2026.md")
        self.assertEqual(out["body"], "# tower\n")
        with self.assertRaises(ValueError):
            client.export_transcript(PROJECT, "pdf")

    def test_admin_routes_refuse_without_a_key(self):
        base, h = self.serve({"GET /api/admin/stats": lambda req, n: {"body": {"counters": []}}})
        with self.assertRaises(ValueError):
            AppleClient(base_url=base, token="x").admin("/api/admin/stats")
        self.assertEqual(len(h.requests), 0)
        AppleClient(base_url=base, token="x", admin_key="secret").admin("/api/admin/stats")
        self.assertEqual(h.requests[-1]["headers"]["X-Admin-Key"], "secret")


class TestStudio(ServerCase):
    def test_token_shape_matches_what_the_worker_admits(self):
        self.assertTrue(is_studio_token(TOKEN))
        self.assertFalse(is_studio_token("{}.{}".format(PROJECT, "a" * 47)))
        self.assertFalse(is_studio_token("{}.{}".format(PROJECT, "A" * 48)))
        self.assertFalse(is_studio_token("not-a-uuid." + SECRET))
        self.assertFalse(is_studio_token(None))

    def test_claim_reports_identity_on_headers(self):
        base, h = self.serve({
            "POST /api/studio/claim": lambda req, n: {"body": {"token": TOKEN, "projectId": PROJECT}},
        })
        client = StudioClient(base_url=base, version="0.2.0", protocol=1)
        client.claim("GLM-7F3K2Q")
        self.assertEqual(client.token, TOKEN)
        self.assertEqual(h.requests[-1]["headers"]["X-Golem-Plugin-Version"], "0.2.0")
        self.assertEqual(h.requests[-1]["headers"]["X-Golem-Plugin-Protocol"], "1")

    def test_polling_before_pairing_sends_nothing(self):
        base, h = self.serve({"POST /api/studio/poll": lambda req, n: {"body": {"ops": []}}})
        with self.assertRaises(ValueError):
            StudioClient(base_url=base).poll()
        self.assertEqual(len(h.requests), 0)

    def test_a_401_ends_the_session_and_is_not_retried(self):
        base, h = self.serve({
            "POST /api/studio/poll": lambda req, n: {"status": 401, "body": {"error": "invalid token"}},
        })
        client = StudioClient(base_url=base, token=TOKEN, sleep=lambda s: None)
        with self.assertRaises(StudioSessionEnded):
            client.poll()
        self.assertEqual(len(h.requests), 1)
        self.assertIsNone(client.token)

    def test_poll_wait_refuses_every_shape_that_would_break_the_loop(self):
        self.assertEqual(poll_wait_seconds({"waitMs": 500}), 0.5)
        self.assertEqual(poll_wait_seconds({"waitMs": "5000"}), 2.0)
        self.assertEqual(poll_wait_seconds({"waitMs": float("nan")}), 2.0)
        self.assertEqual(poll_wait_seconds({"waitMs": float("inf")}), 2.0)
        self.assertEqual(poll_wait_seconds({}), 2.0)
        self.assertEqual(poll_wait_seconds(None), 2.0)
        self.assertEqual(poll_wait_seconds({"waitMs": 0}), 0.2, "zero would be a spin; the floor holds")
        self.assertEqual(poll_wait_seconds({"waitMs": 999999}), 10.0)


if __name__ == "__main__":
    unittest.main()
