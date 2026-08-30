from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path

from .analytics import AnalyticsService, ReadOnlyRepository
from .local_ai import LocalAggregateAssistant
from .sqlite_repository import SQLiteReadOnlyRepository


def answer_question(
    *,
    repository: ReadOnlyRepository,
    assistant: LocalAggregateAssistant,
    topic: str,
    child_id: str,
    start_date: date,
    end_date: date,
    question: str,
) -> str:
    service = AnalyticsService(repository, allowed_child_ids={child_id})
    if topic == "ngu":
        summary = service.sleep_summary(start_date, end_date, child_id=child_id)
    elif topic == "bu":
        summary = service.feeding_summary(start_date, end_date, child_id=child_id)
    elif topic == "moi-truong":
        summary = service.environment_sleep_correlation(start_date, end_date, child_id=child_id)
    else:
        raise ValueError("chủ đề chỉ có thể là ngu, bu hoặc moi-truong")
    return assistant.generate(question, asdict(summary))


def parse_args(argv=None):
    today = date.today()
    parser = argparse.ArgumentParser(
        description="Hỏi AI cục bộ về số liệu tổng hợp của Em Bé (không gửi dữ liệu lên Internet)."
    )
    parser.add_argument("--database", type=Path, required=True, help="Tệp thống kê chỉ đọc")
    parser.add_argument("--be-id", required=True, help="Mã của bé")
    parser.add_argument("--chu-de", choices=("ngu", "bu", "moi-truong"), required=True)
    parser.add_argument("--tu-ngay", type=date.fromisoformat, default=today - timedelta(days=6))
    parser.add_argument("--den-ngay", type=date.fromisoformat, default=today)
    parser.add_argument("--cau-hoi", required=True, help="Câu hỏi bằng tiếng Việt")
    parser.add_argument("--ollama", default="http://127.0.0.1:11434", help=argparse.SUPPRESS)
    parser.add_argument("--model", default="qwen3:8b", help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    repository = SQLiteReadOnlyRepository(args.database)
    assistant = LocalAggregateAssistant(args.ollama, args.model)
    try:
        answer = answer_question(
            repository=repository,
            assistant=assistant,
            topic=args.chu_de,
            child_id=args.be_id,
            start_date=args.tu_ngay,
            end_date=args.den_ngay,
            question=args.cau_hoi,
        )
    finally:
        repository.close()
    print("\nTrả lời từ AI cục bộ:\n")
    print(answer)
    print("\nLưu ý: Đây là diễn giải thống kê, không thay thế tư vấn của bác sĩ.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
