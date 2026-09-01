"""Process bounded Portal requests with the loopback-only EmBe assistant."""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ALLOWED_TOPICS = {"ngu", "bu", "moi-truong", "hoi-dap"}
ALLOWED_DAYS = {7, 14, 30}
QUESTIONS = {
    "ngu": "Tóm tắt nhịp ngủ trong khoảng thời gian này bằng tiếng Việt dễ hiểu cho bố mẹ.",
    "bu": "Tóm tắt lượng bú trong khoảng thời gian này bằng tiếng Việt dễ hiểu cho bố mẹ.",
    "moi-truong": "Diễn giải mối liên hệ mô tả giữa môi trường và giấc ngủ, không suy ra nguyên nhân.",
}


def _request_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: int = 20) -> Any:
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    for attempt, delay in enumerate((0, 1, 2, 4)):
        if delay:
            time.sleep(delay)
        request = Request(url, data=payload, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read(1_000_001)
                if len(raw) > 1_000_000:
                    raise RuntimeError("assistant queue response is too large")
                return json.loads(raw) if raw else None
        except HTTPError as error:
            if error.code not in {408, 425, 429, 500, 502, 503, 504} or attempt == 3:
                raise RuntimeError("assistant queue request failed") from error
        except (URLError, TimeoutError, OSError) as error:
            if attempt == 3:
                raise RuntimeError("assistant queue is unavailable") from error
    raise RuntimeError("assistant queue exhausted retry policy")


@dataclass(frozen=True)
class AssistantJob:
    id: str
    topic: str
    days: int
    question: str | None = None

    @classmethod
    def from_raw(cls, value: dict[str, Any]) -> "AssistantJob":
        question = value.get("question")
        return cls(
            str(value.get("id", "")), str(value.get("topic", "")), int(value.get("days", 0)),
            question.strip() if isinstance(question, str) else None,
        )


class SupabaseAssistantQueue:
    def __init__(self, base_url: str, secret_key: str):
        if not base_url.startswith("https://") or not secret_key:
            raise ValueError("invalid assistant queue configuration")
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "EmBe-Local-Assistant/1.0",
        }

    def _rpc(self, name: str, body: dict[str, Any]) -> Any:
        return _request_json(f"{self.base_url}/rest/v1/rpc/{name}", self.headers, body)

    def claim(self, limit: int = 5) -> list[AssistantJob]:
        payload = self._rpc("embe_claim_assistant_requests", {"p_limit": max(1, min(limit, 10))})
        return [AssistantJob.from_raw(item) for item in payload] if isinstance(payload, list) else []

    def complete(self, job_id: str, answer: str) -> None:
        self._rpc("embe_complete_assistant_request", {"p_id": job_id, "p_answer": answer})

    def fail(self, job_id: str, error_code: str) -> None:
        self._rpc("embe_fail_assistant_request", {"p_id": job_id, "p_error_code": error_code})

    def status(self) -> dict[str, int]:
        value = self._rpc("embe_assistant_queue_status", {}) or {}
        return {key: int(value.get(key, 0)) for key in ("pending", "processing", "dead_letters")}


def process_jobs(
    queue: Any,
    answer: Callable[[str, date, date, str | None], str],
    *,
    today: date | None = None,
) -> dict[str, int]:
    result = {"claimed": 0, "completed": 0, "failed": 0}
    for job in queue.claim(5):
        result["claimed"] += 1
        invalid_question = (
            (job.topic == "hoi-dap" and (not job.question or len(job.question) > 600))
            or (job.topic != "hoi-dap" and job.question is not None)
        )
        if not job.id or job.topic not in ALLOWED_TOPICS or job.days not in ALLOWED_DAYS or invalid_question:
            queue.fail(job.id, "invalid_payload")
            result["failed"] += 1
            continue
        end_date = today or date.today()
        start_date = end_date - timedelta(days=job.days - 1)
        try:
            response = answer(job.topic, start_date, end_date, job.question)
            if not isinstance(response, str) or not 1 <= len(response.strip()) <= 4000:
                raise RuntimeError("invalid local answer")
            queue.complete(job.id, response.strip())
            result["completed"] += 1
        except Exception:
            queue.fail(job.id, "local_ai_unavailable")
            result["failed"] += 1
    return result


def _read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, value = stripped.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def _write_status(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Process private EmBe local-assistant requests.")
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\assistant-worker.json"))
    parser.add_argument("--child-id", default="embe")
    args = parser.parse_args(argv)

    from embe_mcp.ask import answer_question
    from embe_mcp.local_ai import LocalAggregateAssistant
    from embe_mcp.sqlite_repository import SQLiteReadOnlyRepository

    env = {**_read_env(args.env), **os.environ}
    queue = SupabaseAssistantQueue(env.get("SUPABASE_URL", ""), env.get("SUPABASE_SECRET_KEY", ""))
    repository = SQLiteReadOnlyRepository(args.database)
    assistant = LocalAggregateAssistant("http://127.0.0.1:11434", "qwen3:8b", timeout_seconds=45, retries=1)

    def answer(topic: str, start_date: date, end_date: date, question: str | None) -> str:
        if topic == "hoi-dap":
            return assistant.generate(
                "Trả lời câu hỏi của gia đình bằng tiếng Việt ngắn gọn, dễ hiểu. "
                "Không chẩn đoán, không kê thuốc hoặc thay đổi liều. Nếu có dấu hiệu nguy hiểm hoặc câu hỏi cần khám, "
                "hãy hướng dẫn liên hệ bác sĩ. Câu hỏi: " + (question or ""),
                {"source": "family_question", "caution": "pregnancy_safety"},
            )
        return answer_question(
            repository=repository, assistant=assistant, topic=topic, child_id=args.child_id,
            start_date=start_date, end_date=end_date, question=QUESTIONS[topic]
        )

    try:
        processed = process_jobs(queue, answer)
        status = queue.status()
        _write_status(args.status, {
            "schema_version": 1, "status": "ok",
            "last_success_at": datetime.now(timezone.utc).isoformat(),
            "processed": processed, "queue": status,
            "privacy": "Only allowlisted aggregates reach loopback Ollama; no raw records or free-form prompts leave the browser."
        })
    finally:
        repository.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
