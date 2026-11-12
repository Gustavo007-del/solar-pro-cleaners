"""Expo HTTP boundary. Provider responses and tokens must never be logged."""

import json
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.core.config import Settings


class ExpoFailure(Exception):
    def __init__(self, code: str, *, retryable: bool = False, retry_after: int = 0):
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.retry_after = retry_after


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ExpoClient:
    def __init__(self, settings: Settings):
        self.timeout = settings.notification_http_timeout_seconds
        self.access_token = settings.expo_push_access_token
        self.opener = build_opener(NoRedirect())

    def _post(self, operation: str, data):
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.access_token:
            headers["Authorization"] = "Bearer " + self.access_token.get_secret_value()
        request = Request(
            "https://exp.host/--/api/v2/push/" + operation,
            data=json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(),
            headers=headers, method="POST",
        )
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                content = response.read(512_001)
                if len(content) > 512_000:
                    raise ValueError("Unexpected response length")
                return json.loads(content)["data"]
        except HTTPError as exc:
            with exc:
                if exc.code == 429 or 500 <= exc.code <= 599:
                    delay = exc.headers.get("Retry-After", "") if exc.headers else ""
                    raise ExpoFailure(
                        "expo_temporarily_unavailable", retryable=True,
                        retry_after=min(int(delay), 3600) if delay.isascii() and delay.isdecimal() and len(delay) < 8 else 0,
                    ) from None
                if 400 <= exc.code < 500:
                    raise ExpoFailure("expo_request_rejected") from None
                raise ExpoFailure("submission_unknown") from None
        except (URLError, OSError, HTTPException, ValueError, KeyError, TypeError):
            raise ExpoFailure("submission_unknown") from None

    def send(self, messages: list[dict]) -> list[dict]:
        result = self._post("send", messages)
        if not isinstance(result, list) or len(result) != len(messages):
            raise ExpoFailure("submission_unknown")
        return result

    def receipts(self, ids: list[str]) -> dict:
        result = self._post("getReceipts", {"ids": ids})
        if not isinstance(result, dict):
            raise ExpoFailure("receipt_unavailable", retryable=True)
        return result
