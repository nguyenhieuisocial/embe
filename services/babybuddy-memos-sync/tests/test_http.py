import email.utils
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from embe_sync.transport import AuthFailure, HttpClient, PermanentFailure


class Response:
    def __init__(self, data=b"{}", status=200):
        self.data = data
        self.status = status

    def read(self):
        return self.data

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class HttpTests(unittest.TestCase):
    @patch("embe_sync.transport.time.sleep")
    @patch("embe_sync.transport.urllib.request.urlopen")
    def test_retries_transient_status_and_honors_retry_after(self, urlopen, sleep):
        urlopen.side_effect = [
            HTTPError("https://local", 429, "rate", {"Retry-After": "2"}, None),
            Response(b'{"ok":true}'),
        ]
        result = HttpClient(max_attempts=3).request_json("GET", "https://local")
        self.assertEqual(result, {"ok": True})
        sleep.assert_called_once_with(2.0)

    @patch("embe_sync.transport.time.sleep")
    @patch("embe_sync.transport.urllib.request.urlopen")
    def test_retries_network_failure_without_leaking_url_details(self, urlopen, sleep):
        urlopen.side_effect = [URLError("token=super-secret"), Response(b"{}")]
        self.assertEqual(HttpClient(max_attempts=2).request_json("GET", "https://local"), {})
        sleep.assert_called_once_with(1.0)

    @patch("embe_sync.transport.urllib.request.urlopen")
    def test_auth_status_stops_immediately(self, urlopen):
        urlopen.side_effect = HTTPError("https://local", 401, "bad", {}, None)
        with self.assertRaisesRegex(AuthFailure, "authentication"):
            HttpClient(max_attempts=4).request_json("GET", "https://local")
        self.assertEqual(urlopen.call_count, 1)

    @patch("embe_sync.transport.urllib.request.urlopen")
    def test_validation_status_is_permanent(self, urlopen):
        urlopen.side_effect = HTTPError("https://local", 422, "bad", {}, None)
        with self.assertRaisesRegex(PermanentFailure, "rejected"):
            HttpClient(max_attempts=4).request_json("POST", "https://local", {"note": "private"})
        self.assertEqual(urlopen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
