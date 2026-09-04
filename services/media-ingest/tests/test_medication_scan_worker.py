import base64
import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import meal_analysis_worker  # noqa: E402
from meal_analysis_worker import Config, HttpResponse, MealAnalysisWorker, default_transport  # noqa: E402
from medication_scan_worker import MedicationScanWorker, parse_medication_scan_result  # noqa: E402


JPEG = b"\xff\xd8\xff\xe0" + b"medication-photo"
DOCUMENT_ID = "22222222-2222-4222-8222-222222222222"
RECORD_ID = "33333333-3333-4333-8333-333333333333"


def config():
    return Config(
        supabase_url="https://project.supabase.co",
        supabase_secret_key="server-secret",
        ollama_url="http://127.0.0.1:11434",
        ollama_model="qwen3-vl:4b-instruct",
    )


def medication_item(attempts=1):
    return {
        "document_id": DOCUMENT_ID,
        "storage_path": f"records/{RECORD_ID}/{DOCUMENT_ID}.jpg",
        "mime_type": "image/jpeg",
        "byte_size": len(JPEG),
        "attempts": attempts,
    }


class FakeRpc:
    def __init__(self, item=None):
        self.item = medication_item() if item is None else item
        self.calls = []

    def __call__(self, name, payload):
        self.calls.append((name, payload))
        if name == "embe_claim_medication_scan":
            return self.item
        if name in {"embe_finish_medication_scan", "embe_fail_medication_scan"}:
            return None
        raise AssertionError((name, payload))


class ValidTransport:
    def __init__(self):
        self.calls = []

    def __call__(self, method, url, headers, body=None):
        self.calls.append((method, url, headers, body))
        if "/storage/v1/object/authenticated/embe-medical-records/" in url:
            return HttpResponse(200, {"content-type": "image/jpeg"}, JPEG)
        if url.endswith("/api/chat"):
            request = json.loads(body)
            assert request["messages"][0]["images"] == [base64.b64encode(JPEG).decode()]
            assert request["options"]["num_ctx"] >= 8192
            assert "đúng một medicine" in request["messages"][0]["content"]
            return HttpResponse(200, {}, json.dumps({"message": {"content": json.dumps({
                "medicines": [{
                    "name": "Elevit", "dose": "1 viên", "frequency": "Mỗi ngày một lần",
                    "instructions": "Uống sau bữa sáng", "confidence": 0.91,
                }],
                "questions": ["Mẹ kiểm tra lại thông tin với đơn gốc."],
            })}}).encode())
        raise AssertionError((method, url))


def test_accepts_visible_vietnamese_medication_text():
    result = parse_medication_scan_result({
        "medicines": [{
            "name": "Elevit",
            "ingredients": "Sắt 60 mg; axit folic 800 mcg",
            "dose": "1 viên",
            "frequency": "Mỗi ngày một lần",
            "instructions": "Uống sau bữa sáng",
            "confidence": 0.91,
        }],
        "questions": ["Mẹ kiểm tra lại tên thuốc trên vỏ hộp."],
    })

    assert result == {
        "medicines": [{
            "name": "Elevit",
            "ingredients": "Sắt 60 mg; axit folic 800 mcg",
            "dose": "1 viên",
            "frequency": "Mỗi ngày một lần",
            "instructions": "Uống sau bữa sáng",
            "confidence": 0.91,
        }],
        "questions": ["Mẹ kiểm tra lại tên thuốc trên vỏ hộp."],
    }


def test_preserves_blank_fields_instead_of_inferring_a_missing_dose():
    result = parse_medication_scan_result({
        "medicines": [{
            "name": "Omega-3",
            "dose": "",
            "frequency": "",
            "instructions": "",
            "confidence": 0.72,
        }],
        "questions": ["Ảnh chưa nhìn rõ liều và cách dùng."],
    })

    assert result["medicines"][0]["dose"] == ""
    assert result["medicines"][0]["frequency"] == ""
    assert result["medicines"][0]["instructions"] == ""


def test_keeps_visible_active_ingredients_and_strengths_from_the_label():
    long_ingredients = "; ".join([f"Vitamin {index} 10 mg" for index in range(35)])
    result = parse_medication_scan_result({
        "medicines": [{
            "name": "Vitamin tổng hợp",
            "ingredients": long_ingredients,
            "dose": "", "frequency": "", "instructions": "", "confidence": 0.88,
        }],
        "questions": [],
    })

    assert len(long_ingredients) > 300
    assert result["medicines"][0]["ingredients"] == long_ingredients


def test_drops_prompt_echoes_from_review_questions_without_losing_the_medicine():
    result = parse_medication_scan_result({
        "medicines": [{
            "name": "Vitamin tổng hợp", "ingredients": "Sắt 27 mg", "dose": "",
            "frequency": "", "instructions": "", "confidence": 0.88,
        }],
        "questions": [
            "Kiểm tra lại tên sản phẩm trên nhãn.",
            "Chỉ chép nội dung thật sự đọc được và không suy luận.",
            "Trong ingredients, chép nguyên các hoạt chất nhìn thấy.",
        ],
    })

    assert result["questions"] == ["Kiểm tra lại tên sản phẩm trên nhãn."]


@pytest.mark.parametrize("extra_field", ["is_safe", "recommended_dose", "clinician_confirmed"])
def test_rejects_safety_prescribing_or_clinician_fields(extra_field):
    medicine = {
        "name": "Sắt",
        "dose": "1 viên",
        "frequency": "Mỗi ngày",
        "instructions": "",
        "confidence": 0.8,
        extra_field: True,
    }

    with pytest.raises(ValueError, match="invalid_medication_scan_result"):
        parse_medication_scan_result({"medicines": [medicine], "questions": []})


def test_rejects_more_than_twelve_medicines_and_unbounded_text():
    item = {"name": "Sắt", "dose": "", "frequency": "", "instructions": "", "confidence": 0.8}
    with pytest.raises(ValueError, match="invalid_medication_scan_result"):
        parse_medication_scan_result({"medicines": [item] * 13, "questions": []})
    with pytest.raises(ValueError, match="invalid_medication_scan_result"):
        parse_medication_scan_result({
            "medicines": [{**item, "instructions": "x" * 201}],
            "questions": [],
        })


def test_downloads_only_the_private_medical_image_and_stores_a_review_draft():
    rpc = FakeRpc()
    transport = ValidTransport()
    result = MedicationScanWorker(config(), transport, rpc).run_once()

    assert result == {"status": "review", "document_id": DOCUMENT_ID, "medicine_count": 1}
    download = next(call for call in transport.calls if "/storage/v1/object/" in call[1])
    assert download[1].startswith("https://project.supabase.co/storage/v1/object/authenticated/embe-medical-records/")
    finish = next(call for call in rpc.calls if call[0] == "embe_finish_medication_scan")
    assert finish[1]["p_document_id"] == DOCUMENT_ID
    assert finish[1]["p_checksum_sha256"] == hashlib.sha256(JPEG).hexdigest()
    assert finish[1]["p_model_name"] == "qwen3-vl:4b-instruct"
    assert finish[1]["p_extraction"]["medicines"][0]["name"] == "Elevit"
    assert not any(call[0] == "DELETE" for call in transport.calls)


def test_retries_once_when_medication_json_is_truncated():
    valid = {
        "medicines": [{
            "name": "Omega-3", "dose": "", "frequency": "", "instructions": "", "confidence": 0.7,
        }],
        "questions": ["Ảnh chưa nhìn rõ liều."],
    }

    class TruncatedThenValidTransport:
        def __init__(self):
            self.requests = []

        def __call__(self, method, url, headers, body=None):
            assert url.endswith("/api/chat")
            self.requests.append(json.loads(body))
            content = '{"medicines":[{"name":"Omega' if len(self.requests) == 1 else json.dumps(valid)
            return HttpResponse(200, {}, json.dumps({"message": {"content": content}}).encode())

    transport = TruncatedThenValidTransport()
    result = MedicationScanWorker(config(), transport, lambda *_args: None)._analyze(JPEG)

    assert result == valid
    assert len(transport.requests) == 2
    assert "JSON trước bị cắt" in transport.requests[1]["messages"][0]["content"]


def test_model_failure_uses_bounded_exponential_backoff_without_deleting_the_image():
    rpc = FakeRpc(medication_item(attempts=3))

    class BrokenTransport(ValidTransport):
        def __call__(self, method, url, headers, body=None):
            if url.endswith("/api/chat"):
                self.calls.append((method, url, headers, body))
                return HttpResponse(503, {}, b"")
            return super().__call__(method, url, headers, body)

    transport = BrokenTransport()
    result = MedicationScanWorker(config(), transport, rpc).run_once()

    assert result == {"status": "retry", "document_id": DOCUMENT_ID, "error": "medication_vision_unavailable"}
    failure = next(call for call in rpc.calls if call[0] == "embe_fail_medication_scan")
    assert failure[1] == {
        "p_document_id": DOCUMENT_ID,
        "p_error_code": "medication_vision_unavailable",
        "p_retry_after_seconds": 240,
    }
    assert not any(call[0] == "DELETE" for call in transport.calls)


@pytest.mark.parametrize(("body", "byte_size", "error_code"), [
    (b"not-an-image", len(b"not-an-image"), "invalid_medication_image_signature"),
    (JPEG, len(JPEG) + 1, "medication_staging_download_failed"),
])
def test_rejects_invalid_medical_image_signature_or_size(body, byte_size, error_code):
    item = {**medication_item(), "byte_size": byte_size}
    rpc = FakeRpc(item)

    class InvalidImageTransport:
        def __init__(self):
            self.calls = []

        def __call__(self, method, url, headers, request_body=None):
            self.calls.append((method, url, headers, request_body))
            if "/storage/v1/object/authenticated/embe-medical-records/" in url:
                return HttpResponse(200, {}, body)
            raise AssertionError("Ollama must not receive an invalid image")

    result = MedicationScanWorker(config(), InvalidImageTransport(), rpc).run_once()
    assert result["error"] == error_code


def test_resident_meal_worker_checks_medication_queue_before_nutrition():
    class QueueTransport(ValidTransport):
        def __call__(self, method, url, headers, body=None):
            self.calls.append((method, url, headers, body))
            if url.endswith("/rest/v1/rpc/embe_claim_meal_analysis"):
                return HttpResponse(200, {}, b"null")
            if url.endswith("/rest/v1/rpc/embe_claim_medication_scan"):
                return HttpResponse(200, {}, json.dumps(medication_item()).encode())
            if url.endswith("/rest/v1/rpc/embe_finish_medication_scan"):
                return HttpResponse(204, {}, b"")
            if "/storage/v1/object/authenticated/embe-medical-records/" in url:
                return HttpResponse(200, {"content-type": "image/jpeg"}, JPEG)
            if url.endswith("/api/chat"):
                return HttpResponse(200, {}, json.dumps({"message": {"content": json.dumps({
                    "medicines": [{
                        "name": "Elevit", "dose": "1 viên", "frequency": "Mỗi ngày",
                        "instructions": "", "confidence": 0.9,
                    }],
                    "questions": [],
                })}}).encode())
            raise AssertionError((method, url))

    transport = QueueTransport()
    result = MealAnalysisWorker(config(), transport).run_once()

    assert result == {"status": "review", "document_id": DOCUMENT_ID, "medicine_count": 1}
    endpoints = [call[1].rsplit("/", 1)[-1] for call in transport.calls if "/rest/v1/rpc/" in call[1]]
    assert endpoints[:3] == [
        "embe_claim_meal_analysis", "embe_claim_medication_scan", "embe_finish_medication_scan",
    ]
    assert "embe_claim_meal_nutrition" not in endpoints


def test_resident_worker_keeps_existing_nutrition_fallback_when_scan_queue_is_empty():
    class EmptyQueuesTransport:
        def __init__(self):
            self.calls = []

        def __call__(self, method, url, headers, body=None):
            self.calls.append((method, url, headers, body))
            if any(url.endswith(f"/rest/v1/rpc/{name}") for name in (
                "embe_claim_meal_analysis", "embe_claim_medication_scan", "embe_claim_meal_nutrition"
            )):
                return HttpResponse(200, {}, b"null")
            raise AssertionError((method, url))

    transport = EmptyQueuesTransport()
    result = MealAnalysisWorker(config(), transport).run_once()

    assert result == {"status": "idle"}
    assert [call[1].rsplit("/", 1)[-1] for call in transport.calls] == [
        "embe_claim_meal_analysis", "embe_claim_medication_scan", "embe_claim_meal_nutrition",
    ]


def test_shared_transport_accepts_the_existing_medical_bucket_image_limit(monkeypatch):
    image = b"\xff\xd8\xff" + b"x" * (14_000_000 - 3)

    class Response:
        status = 200
        headers = {}

        def read(self, limit):
            return image[:limit]

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(meal_analysis_worker, "urlopen", lambda *_args, **_kwargs: Response())
    item = {**medication_item(), "byte_size": len(image)}

    body = MedicationScanWorker(config(), default_transport, lambda *_args: None)._download(item)

    assert len(body) == 14_000_000
