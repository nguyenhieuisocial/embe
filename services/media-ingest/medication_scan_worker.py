from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any, Callable, Mapping
from urllib.parse import quote


MEDICAL_BUCKET = "embe-medical-records"
MAX_MEDICATION_IMAGE_BYTES = 15_000_000
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
STORAGE_PATH = re.compile(
    r"^records/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/"
    r"([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$"
)


class WorkerFailure(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


MEDICATION_PROMPT = """Bạn đang chép lại thông tin nhìn thấy trực tiếp trên ảnh đơn thuốc, nhãn hoặc vỏ hộp.
Chỉ chép nội dung thật sự đọc được. Giữ nguyên tên thương hiệu và hàm lượng in trên ảnh; viết phần diễn giải bằng tiếng Việt tự nhiên.
Nếu không nhìn rõ liều, số lần hoặc cách dùng thì bắt buộc để trường tương ứng là chuỗi rỗng, không suy luận và không điền theo kiến thức có sẵn.
Không đánh giá thuốc có an toàn cho thai kỳ hay không, không kê đơn, không đề xuất liều, không xác nhận bác sĩ và không đưa lời khuyên điều trị.
Câu hỏi chỉ dùng để nhờ người dùng kiểm tra lại chữ không rõ trên ảnh. Trả về đúng JSON theo schema, tối đa 12 thuốc."""


def _validate_image(body: bytes, mime_type: str) -> None:
    if not 1 <= len(body) <= MAX_MEDICATION_IMAGE_BYTES:
        raise WorkerFailure("invalid_medication_image_size")
    valid = (
        (mime_type == "image/jpeg" and body.startswith(b"\xff\xd8\xff"))
        or (mime_type == "image/png" and body.startswith(b"\x89PNG\r\n\x1a\n"))
        or (mime_type == "image/webp" and len(body) >= 12 and body[:4] == b"RIFF" and body[8:12] == b"WEBP")
    )
    if not valid:
        raise WorkerFailure("invalid_medication_image_signature")


def parse_medication_scan_result(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"medicines", "questions"}:
        raise ValueError("invalid_medication_scan_result")
    medicines = value["medicines"]
    questions = value["questions"]
    if not isinstance(medicines, list) or len(medicines) > 12:
        raise ValueError("invalid_medication_scan_result")
    if (not isinstance(questions, list) or len(questions) > 6
            or any(not isinstance(question, str) or not 1 <= len(question.strip()) <= 120
                   for question in questions)):
        raise ValueError("invalid_medication_scan_result")

    normalized: list[dict[str, Any]] = []
    for medicine in medicines:
        if not isinstance(medicine, dict) or set(medicine) != {
            "name", "dose", "frequency", "instructions", "confidence"
        }:
            raise ValueError("invalid_medication_scan_result")
        name = medicine["name"]
        dose = medicine["dose"]
        frequency = medicine["frequency"]
        instructions = medicine["instructions"]
        confidence = medicine["confidence"]
        if (not isinstance(name, str) or not 1 <= len(name.strip()) <= 100
                or not isinstance(dose, str) or len(dose.strip()) > 80
                or not isinstance(frequency, str) or len(frequency.strip()) > 80
                or not isinstance(instructions, str) or len(instructions.strip()) > 200
                or not isinstance(confidence, (int, float)) or isinstance(confidence, bool)
                or not 0 <= confidence <= 1):
            raise ValueError("invalid_medication_scan_result")
        normalized.append({
            "name": name.strip(),
            "dose": dose.strip(),
            "frequency": frequency.strip(),
            "instructions": instructions.strip(),
            "confidence": round(float(confidence), 2),
        })
    return {
        "medicines": normalized,
        "questions": [question.strip() for question in questions],
    }


Rpc = Callable[[str, Mapping[str, object]], Any]


class MedicationScanWorker:
    def __init__(self, config: Any, transport: Callable[..., Any], rpc: Rpc):
        self.config = config
        self.transport = transport
        self.rpc = rpc

    @property
    def supabase_headers(self) -> dict[str, str]:
        return {
            "accept": "application/json",
            "content-type": "application/json",
            "apikey": self.config.supabase_secret_key,
            "authorization": f"Bearer {self.config.supabase_secret_key}",
        }

    def _download(self, item: Mapping[str, object]) -> bytes:
        document_id = str(item.get("document_id", ""))
        storage_path = str(item.get("storage_path", ""))
        mime_type = str(item.get("mime_type", ""))
        byte_size = item.get("byte_size")
        path_match = STORAGE_PATH.fullmatch(storage_path)
        if (not path_match or path_match.group(1) != document_id
                or mime_type not in {"image/jpeg", "image/png", "image/webp"}
                or not isinstance(byte_size, int) or isinstance(byte_size, bool)
                or not 1 <= byte_size <= MAX_MEDICATION_IMAGE_BYTES):
            raise WorkerFailure("invalid_medication_image_metadata")
        encoded = "/".join(quote(part, safe="") for part in storage_path.split("/"))
        response = self.transport(
            "GET",
            f"{self.config.supabase_url}/storage/v1/object/authenticated/{MEDICAL_BUCKET}/{encoded}",
            self.supabase_headers,
        )
        if response.status != 200 or len(response.body) != byte_size:
            raise WorkerFailure("medication_staging_download_failed")
        _validate_image(response.body, mime_type)
        return response.body

    def _analyze(self, body: bytes) -> dict[str, Any]:
        schema = {
            "type": "object",
            "required": ["medicines", "questions"],
            "additionalProperties": False,
            "properties": {
                "medicines": {
                    "type": "array", "maxItems": 12,
                    "items": {
                        "type": "object",
                        "required": ["name", "dose", "frequency", "instructions", "confidence"],
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "minLength": 1, "maxLength": 100},
                            "dose": {"type": "string", "maxLength": 80},
                            "frequency": {"type": "string", "maxLength": 80},
                            "instructions": {"type": "string", "maxLength": 200},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                    },
                },
                "questions": {
                    "type": "array", "maxItems": 6,
                    "items": {"type": "string", "minLength": 1, "maxLength": 120},
                },
            },
        }
        payload = {
            "model": self.config.ollama_model,
            "stream": False,
            "think": False,
            "format": schema,
            "keep_alive": "24h",
            "options": {"temperature": 0, "num_predict": 1024},
            "messages": [{
                "role": "user",
                "content": MEDICATION_PROMPT,
                "images": [base64.b64encode(body).decode()],
            }],
        }
        last_error: Exception | None = None
        for attempt in range(2):
            response = self.transport(
                "POST",
                f"{self.config.ollama_url}/api/chat",
                {"content-type": "application/json"},
                json.dumps(payload, ensure_ascii=False).encode(),
            )
            if response.status != 200:
                raise WorkerFailure("medication_vision_unavailable")
            try:
                outer = json.loads(response.body)
                raw_result = json.loads(outer["message"]["content"])
                return parse_medication_scan_result(raw_result)
            except (KeyError, TypeError, json.JSONDecodeError, ValueError) as error:
                last_error = error
                if attempt == 0:
                    payload["messages"][0]["content"] += (
                        "\nJSON trước bị cắt hoặc sai cấu trúc. Trả lại JSON thật gọn, "
                        "không thêm trường về an toàn, kê đơn, liều đề xuất hoặc xác nhận bác sĩ."
                    )
        raise WorkerFailure("invalid_medication_vision_output") from last_error

    def run_once(self) -> dict[str, object]:
        item = self.rpc("embe_claim_medication_scan", {})
        if item is None:
            return {"status": "idle"}
        if not isinstance(item, dict) or not UUID.match(str(item.get("document_id", ""))):
            raise RuntimeError("invalid medication scan queue response")
        document_id = str(item["document_id"])
        try:
            body = self._download(item)
            extraction = self._analyze(body)
            self.rpc("embe_finish_medication_scan", {
                "p_document_id": document_id,
                "p_checksum_sha256": hashlib.sha256(body).hexdigest(),
                "p_model_name": self.config.ollama_model,
                "p_extraction": extraction,
            })
            return {
                "status": "review",
                "document_id": document_id,
                "medicine_count": len(extraction["medicines"]),
            }
        except WorkerFailure as error:
            attempts_value = item.get("attempts", 1)
            attempts = attempts_value if isinstance(attempts_value, int) and not isinstance(attempts_value, bool) else 1
            retry_seconds = min(86_400, 60 * (2 ** min(max(attempts, 1) - 1, 10)))
            self.rpc("embe_fail_medication_scan", {
                "p_document_id": document_id,
                "p_error_code": error.code,
                "p_retry_after_seconds": retry_seconds,
            })
            return {"status": "retry", "document_id": document_id, "error": error.code}
