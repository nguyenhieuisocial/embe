import base64
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from meal_analysis_worker import (  # noqa: E402
    Config,
    HttpResponse,
    MealAnalysisWorker,
    parse_vision_result,
)


JPEG = b"\xff\xd8\xff\xe0" + b"meal-photo"
ENTRY_ID = "11111111-1111-4111-8111-111111111111"


class FakeTransport:
    def __init__(self):
        self.calls = []

    def __call__(self, method, url, headers, body=None):
        self.calls.append((method, url, headers, body))
        if url.endswith("/rest/v1/rpc/embe_claim_meal_analysis"):
            return HttpResponse(200, {}, json.dumps({
                "id": ENTRY_ID,
                "storage_path": f"incoming/2026/09/{ENTRY_ID}.jpg",
                "mime_type": "image/jpeg",
                "byte_size": len(JPEG),
                "note": "cơm ít, cá kho và rau luộc",
                "meal_type": "lunch",
                "eaten_at": "2026-09-01T05:00:00+00:00",
                "attempts": 1,
            }).encode())
        if "/storage/v1/object/authenticated/" in url:
            return HttpResponse(200, {"content-type": "image/jpeg"}, JPEG)
        if url.endswith("/api/chat"):
            request = json.loads(body)
            assert request["model"] == "qwen3-vl:4b-instruct"
            assert request["messages"][0]["images"] == [base64.b64encode(JPEG).decode()]
            return HttpResponse(200, {}, json.dumps({"message": {"content": json.dumps({
                "foods": [
                    {"name_vi": "Cơm trắng", "search_name_en": "white rice cooked", "estimated_grams": 120,
                     "confidence": 0.82, "food_groups": ["starch"], "safety_flags": []},
                    {"name_vi": "Cá kiếm nướng", "search_name_en": "swordfish cooked", "estimated_grams": 90,
                     "confidence": 0.61, "food_groups": ["protein"], "safety_flags": ["high_mercury_possible"]},
                ],
                "needs_user_confirmation": ["Loại cá", "Khối lượng cơm"],
            })}}).encode())
        if url.endswith("/rest/v1/rpc/embe_finish_meal_analysis"):
            return HttpResponse(204, {}, b"")
        if "/storage/v1/object/embe-meal-inbox/" in url and method == "DELETE":
            return HttpResponse(200, {}, b"{}")
        raise AssertionError((method, url))


def config():
    return Config(
        supabase_url="https://project.supabase.co",
        supabase_secret_key="server-secret",
        ollama_url="http://127.0.0.1:11434",
        ollama_model="qwen3-vl:4b-instruct",
    )


def test_rejects_unbounded_or_invented_vision_payloads():
    invalid = {
        "foods": [{"name_vi": "x", "search_name_en": "x", "estimated_grams": 1,
                   "confidence": 1, "food_groups": ["diagnosis"], "safety_flags": []}],
        "needs_user_confirmation": [],
    }
    try:
        parse_vision_result(invalid)
    except ValueError as error:
        assert str(error) == "invalid_vision_result"
    else:
        raise AssertionError("unbounded model output was accepted")


def test_downloads_analyzes_stores_review_draft_and_removes_staging_image():
    transport = FakeTransport()
    result = MealAnalysisWorker(config(), transport).run_once()

    assert result == {"status": "review", "entry_id": ENTRY_ID, "food_count": 2}
    finish = next(call for call in transport.calls if call[1].endswith("embe_finish_meal_analysis"))
    payload = json.loads(finish[3])
    assert payload["p_checksum_sha256"] == hashlib.sha256(JPEG).hexdigest()
    assert payload["p_model_name"] == "qwen3-vl:4b-instruct"
    assert payload["p_analysis"]["estimate_notice"].startswith("Ước lượng từ ảnh")
    assert payload["p_analysis"]["foods"][1]["safety_flags"] == ["high_mercury_possible"]
    assert transport.calls[-1][0] == "DELETE"


def test_model_failure_is_retried_without_deleting_the_image():
    class Broken(FakeTransport):
        def __call__(self, method, url, headers, body=None):
            if url.endswith("/api/chat"):
                self.calls.append((method, url, headers, body))
                return HttpResponse(503, {}, b"")
            if url.endswith("/rest/v1/rpc/embe_fail_meal_analysis"):
                self.calls.append((method, url, headers, body))
                return HttpResponse(204, {}, b"")
            return super().__call__(method, url, headers, body)

    transport = Broken()
    result = MealAnalysisWorker(config(), transport).run_once()
    assert result == {"status": "retry", "entry_id": ENTRY_ID, "error": "vision_unavailable"}
    assert not any(call[0] == "DELETE" for call in transport.calls)


def test_confirmed_food_uses_provider_values_and_returns_an_honest_calorie_range():
    class NutritionTransport:
        def __init__(self):
            self.calls = []

        def __call__(self, method, url, headers, body=None):
            self.calls.append((method, url, headers, body))
            if "api.nal.usda.gov/fdc/v1/foods/search" in url:
                return HttpResponse(200, {}, json.dumps({"foods": [{
                    "fdcId": 123, "description": "Rice, white, cooked",
                    "foodNutrients": [
                        {"nutrientId": 1008, "nutrientNumber": "208", "value": 130},
                        {"nutrientId": 1003, "nutrientNumber": "203", "value": 2.7},
                        {"nutrientId": 1005, "nutrientNumber": "205", "value": 28.2},
                    ],
                }]}).encode())
            raise AssertionError((method, url))

    transport = NutritionTransport()
    worker = MealAnalysisWorker(config(), transport)
    nutrition = worker._calculate_nutrition({
        "foods": [{"name_vi": "Cơm trắng", "search_name_en": "white rice cooked", "estimated_grams": 200,
                   "confidence": 0.8, "food_groups": ["starch"], "safety_flags": []}],
        "needs_user_confirmation": [], "estimate_notice": "reviewed",
    })

    assert nutrition["source"] == "USDA FoodData Central (local SR Legacy + API)"
    assert nutrition["totals"]["calories"] == 260.0
    assert nutrition["calorie_range"]["low"] < 260 < nutrition["calorie_range"]["high"]
    assert nutrition["items"][0]["fdc_id"] == 123


def test_local_usda_snapshot_keeps_known_food_available_when_the_api_is_limited(tmp_path):
    database = tmp_path / "usda.sqlite"
    connection = sqlite3.connect(database)
    connection.executescript("""
      CREATE TABLE foods (
        fdc_id INTEGER PRIMARY KEY, description TEXT NOT NULL,
        calories REAL, protein_g REAL, fat_g REAL, carbs_g REAL,
        fiber_g REAL, calcium_mg REAL, iron_mg REAL, folate_ug REAL
      );
      CREATE VIRTUAL TABLE food_search USING fts5(description, content='foods', content_rowid='fdc_id');
      INSERT INTO foods VALUES (169711, 'Rice, white, cooked', 130, 2.7, 0.3, 28.2, 0.4, 10, 0.2, 58);
      INSERT INTO food_search(food_search) VALUES ('rebuild');
    """)
    connection.commit()
    connection.close()

    class LimitedTransport:
        def __call__(self, method, url, headers, body=None):
            return HttpResponse(429, {}, b"")

    worker = MealAnalysisWorker(Config(
        supabase_url="https://project.supabase.co", supabase_secret_key="server-secret",
        nutrition_local_db_path=str(database),
    ), LimitedTransport())
    nutrition = worker._calculate_nutrition({
        "foods": [
            {"name_vi": "Cơm trắng", "search_name_en": "white rice cooked", "estimated_grams": 200,
             "confidence": 0.9, "food_groups": ["starch"], "safety_flags": []},
            {"name_vi": "Món chưa rõ", "search_name_en": "unmapped dish", "estimated_grams": 50,
             "confidence": 0.5, "food_groups": ["other"], "safety_flags": ["unknown"]},
        ],
        "needs_user_confirmation": [], "estimate_notice": "reviewed",
    })

    assert nutrition["status"] == "estimated"
    assert nutrition["totals"]["calories"] == 260.0
    assert "1 món chưa ghép" in nutrition["notice"]
