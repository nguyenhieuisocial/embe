import base64
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from meal_analysis_worker import (  # noqa: E402
    Config,
    HttpResponse,
    MealAnalysisWorker,
    nutrition_search_query,
    parse_vision_result,
    run_worker_loop,
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
            assert request["keep_alive"] == "24h"
            assert request["options"]["num_predict"] == 512
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


def test_downloads_analyzes_stores_review_draft_and_keeps_private_source_image():
    transport = FakeTransport()
    result = MealAnalysisWorker(config(), transport).run_once()

    assert result == {"status": "review", "entry_id": ENTRY_ID, "food_count": 2}
    finish = next(call for call in transport.calls if call[1].endswith("embe_finish_meal_analysis"))
    payload = json.loads(finish[3])
    assert payload["p_checksum_sha256"] == hashlib.sha256(JPEG).hexdigest()
    assert payload["p_model_name"] == "qwen3-vl:4b-instruct"
    assert payload["p_analysis"]["estimate_notice"].startswith("Ước lượng từ ảnh")
    assert payload["p_analysis"]["foods"][1]["safety_flags"] == ["high_mercury_possible"]
    assert not any(call[0] == "DELETE" for call in transport.calls)


def test_prewarms_the_vision_model_without_sending_user_data():
    class PrewarmTransport:
        def __init__(self):
            self.request = None

        def __call__(self, method, url, headers, body=None):
            assert method == "POST"
            assert url.endswith("/api/chat")
            self.request = json.loads(body)
            return HttpResponse(200, {}, b'{}')

    transport = PrewarmTransport()
    MealAnalysisWorker(config(), transport).prewarm()

    assert transport.request == {
        "model": "qwen3-vl:4b-instruct", "stream": False, "keep_alive": "24h"
    }


def test_resident_worker_polls_quickly_without_restarting_the_process(tmp_path):
    class ResidentWorker:
        def __init__(self):
            self.prewarmed = 0
            self.runs = 0
            self.heartbeats = []

        def prewarm(self):
            self.prewarmed += 1

        def run_once(self):
            self.runs += 1
            return {"status": "idle"}

        def report_heartbeat(self, result):
            self.heartbeats.append(result)

    sleeps = []
    worker = ResidentWorker()
    run_worker_loop(worker, tmp_path / "status.json", poll_interval=2, heartbeat_interval=60,
                    sleep=sleeps.append, monotonic=iter([0.0, 0.0, 2.0, 4.0]).__next__, max_iterations=3)

    assert worker.prewarmed == 1
    assert worker.runs == 3
    assert worker.heartbeats == [{"status": "idle"}]
    assert sleeps == [2, 2]


def test_analyzes_a_written_meal_without_downloading_or_deleting_an_image():
    class TextTransport:
        def __init__(self):
            self.calls = []

        def __call__(self, method, url, headers, body=None):
            self.calls.append((method, url, headers, body))
            if url.endswith("/rest/v1/rpc/embe_claim_meal_analysis"):
                return HttpResponse(200, {}, json.dumps({
                    "id": ENTRY_ID, "storage_path": None, "mime_type": None, "byte_size": None,
                    "note": "Một ly sữa và một quả chuối", "meal_type": "snack",
                    "eaten_at": "2026-09-02T06:00:00+00:00", "attempts": 1,
                }).encode())
            if url.endswith("/api/chat"):
                request = json.loads(body)
                assert "images" not in request["messages"][0]
                assert "Một ly sữa và một quả chuối" in request["messages"][0]["content"]
                return HttpResponse(200, {}, json.dumps({"message": {"content": json.dumps({
                    "foods": [
                        {"name_vi": "Sữa", "search_name_en": "milk", "estimated_grams": 240,
                         "confidence": 0.75, "food_groups": ["dairy"], "safety_flags": []},
                        {"name_vi": "Chuối", "search_name_en": "banana", "estimated_grams": 100,
                         "confidence": 0.8, "food_groups": ["fruit"], "safety_flags": []},
                    ], "needs_user_confirmation": []
                })}}).encode())
            if url.endswith("/rest/v1/rpc/embe_finish_meal_analysis"):
                return HttpResponse(204, {}, b"")
            raise AssertionError((method, url))

    transport = TextTransport()
    result = MealAnalysisWorker(config(), transport).run_once()

    assert result == {"status": "review", "entry_id": ENTRY_ID, "food_count": 2}
    finish = next(call for call in transport.calls if call[1].endswith("embe_finish_meal_analysis"))
    payload = json.loads(finish[3])
    assert payload["p_checksum_sha256"] == hashlib.sha256("Một ly sữa và một quả chuối".encode()).hexdigest()
    assert not any("/storage/v1/object/" in call[1] for call in transport.calls)


def test_keeps_an_ambiguous_written_note_without_inventing_food():
    class AmbiguousTextTransport:
        def __call__(self, method, url, headers, body=None):
            if url.endswith("/api/chat"):
                return HttpResponse(200, {}, json.dumps({"message": {"content": json.dumps({
                    "foods": [], "needs_user_confirmation": []
                })}}).encode())
            raise AssertionError((method, url))

    result = MealAnalysisWorker(config(), AmbiguousTextTransport())._analyze(None, "Hôm nay ăn ngon")
    assert result["entry_mode"] == "note"
    assert result["foods"] == []
    assert "không tự đoán" in result["estimate_notice"]


def test_accepts_a_safe_clarification_question_for_an_ambiguous_written_note():
    class ClarificationTransport:
        def __call__(self, method, url, headers, body=None):
            if url.endswith("/api/chat"):
                return HttpResponse(200, {}, json.dumps({"message": {"content": json.dumps({
                    "foods": [], "needs_user_confirmation": ["Mẹ đã ăn món gì?"]
                })}}).encode())
            raise AssertionError((method, url))

    result = MealAnalysisWorker(config(), ClarificationTransport())._analyze(None, "Hôm nay ăn ngon")
    assert result["entry_mode"] == "note"
    assert result["foods"] == []
    assert result["needs_user_confirmation"] == ["Mẹ đã ăn món gì?"]


def test_reports_a_bounded_health_signal_without_exposing_worker_details():
    class HeartbeatTransport:
        def __init__(self):
            self.payload = None

        def __call__(self, method, url, headers, body=None):
            assert method == "POST"
            assert url.endswith("/rest/v1/rpc/embe_touch_worker_heartbeat")
            self.payload = json.loads(body)
            return HttpResponse(204, {}, b"")

    transport = HeartbeatTransport()
    MealAnalysisWorker(config(), transport).report_heartbeat({"status": "retry", "error": "private-detail"})
    assert transport.payload == {
        "p_worker_name": "meal-analysis", "p_state": "degraded", "p_detail": "retry"
    }


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
      INSERT INTO foods VALUES (169711, 'Rice, white, long grain, cooked', 130, 2.7, 0.3, 28.2, 0.4, 10, 0.2, 58);
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


def test_nutrition_never_uses_a_contradictory_ai_food_mapping(tmp_path):
    database = tmp_path / "usda.sqlite"
    connection = sqlite3.connect(database)
    connection.executescript("""
      CREATE TABLE foods (
        fdc_id INTEGER PRIMARY KEY, description TEXT NOT NULL,
        calories REAL, protein_g REAL, fat_g REAL, carbs_g REAL,
        fiber_g REAL, calcium_mg REAL, iron_mg REAL, folate_ug REAL
      );
      CREATE VIRTUAL TABLE food_search USING fts5(description, content='foods', content_rowid='fdc_id');
      INSERT INTO foods VALUES (1, 'Cauliflower, roasted', 23, 1.8, 0.4, 4.1, 2.3, 16, 0.3, 44);
      INSERT INTO foods VALUES (2, 'Peppers, sweet, red, raw', 26, 1, 0.3, 6, 2.1, 7, 0.4, 46);
      INSERT INTO food_search(food_search) VALUES ('rebuild');
    """)
    connection.commit()
    connection.close()

    worker = MealAnalysisWorker(Config(
        supabase_url="https://project.supabase.co", supabase_secret_key="server-secret",
        nutrition_local_db_path=str(database),
    ), lambda *_args, **_kwargs: HttpResponse(429, {}, b""))
    nutrition = worker._calculate_nutrition({
        "foods": [{"name_vi": "Ớt chuông", "search_name_en": "roasted cauliflower",
                   "estimated_grams": 100, "confidence": 0.7,
                   "food_groups": ["vegetables"], "safety_flags": []}],
        "needs_user_confirmation": [], "estimate_notice": "reviewed",
    })

    assert nutrition["totals"]["calories"] == 26
    assert nutrition["items"][0]["source_description"] == "Peppers, sweet, red, raw"


def test_local_nutrition_snapshot_fails_closed_instead_of_searching_a_remote_guess(tmp_path):
    database = tmp_path / "usda.sqlite"
    connection = sqlite3.connect(database)
    connection.executescript("""
      CREATE TABLE foods (
        fdc_id INTEGER PRIMARY KEY, description TEXT NOT NULL,
        calories REAL, protein_g REAL, fat_g REAL, carbs_g REAL,
        fiber_g REAL, calcium_mg REAL, iron_mg REAL, folate_ug REAL
      );
      CREATE VIRTUAL TABLE food_search USING fts5(description, content='foods', content_rowid='fdc_id');
      INSERT INTO foods VALUES (1, 'Bananas, raw', 89, 1.1, 0.3, 22.8, 2.6, 5, 0.3, 20);
      INSERT INTO food_search(food_search) VALUES ('rebuild');
    """)
    connection.commit()
    connection.close()

    def no_remote_guess(*_args, **_kwargs):
        raise AssertionError("remote nutrition search must not run when the complete local snapshot is available")

    worker = MealAnalysisWorker(Config(
        supabase_url="https://project.supabase.co", supabase_secret_key="server-secret",
        nutrition_local_db_path=str(database),
    ), no_remote_guess)

    assert worker._lookup_food("unmapped vietnamese dish") is None


def test_vision_result_localizes_common_english_food_names_for_vietnamese_ui():
    parsed = parse_vision_result({
        "foods": [{"name_vi": "Fried rice", "search_name_en": "fried rice with egg",
                   "estimated_grams": 220, "confidence": 0.8,
                   "food_groups": ["starch", "protein"], "safety_flags": []}],
        "needs_user_confirmation": [],
    })

    assert parsed["foods"][0]["name_vi"] == "Cơm chiên trứng"


@pytest.mark.parametrize(("english_name", "vietnamese_name"), [
    ("Grilled beef", "Thịt bò nướng"),
    ("Bell pepper", "Ớt chuông"),
    ("Roasted cauliflower", "Súp lơ nướng"),
    ("Cucumber slices", "Dưa leo"),
    ("Tomato", "Cà chua"),
])
def test_vision_result_localizes_common_meal_components(english_name, vietnamese_name):
    parsed = parse_vision_result({
        "foods": [{"name_vi": english_name, "search_name_en": english_name,
                   "estimated_grams": 100, "confidence": 0.8,
                   "food_groups": ["vegetables"], "safety_flags": []}],
        "needs_user_confirmation": [],
    })

    assert parsed["foods"][0]["name_vi"] == vietnamese_name


def test_vision_result_never_exposes_an_unknown_english_name_as_vietnamese():
    parsed = parse_vision_result({
        "foods": [{"name_vi": "Unknown casserole", "search_name_en": "unknown casserole",
                   "estimated_grams": None, "confidence": 0.4,
                   "food_groups": ["other"], "safety_flags": []}],
        "needs_user_confirmation": ["Please confirm the dish and portion"],
    })

    assert parsed["foods"][0]["name_vi"] == "Món cần Mẹ xác nhận"
    assert "Nhập lại tên món bằng tiếng Việt." in parsed["needs_user_confirmation"]
    assert "Please confirm the dish and portion" not in parsed["needs_user_confirmation"]


def test_user_corrected_vietnamese_food_uses_a_safe_usda_query_instead_of_the_old_dish():
    assert nutrition_search_query("Đậu hũ") == "tofu raw firm calcium"
    assert nutrition_search_query("Cơm gạo lứt") == "rice brown long grain cooked"
    assert nutrition_search_query("Ớt chuông") == "peppers sweet raw"
    assert nutrition_search_query("Dưa leo") == "cucumber raw"


def test_confirmed_vietnamese_name_overrides_a_contradictory_ai_search_name():
    assert nutrition_search_query("Ớt chuông", "roasted cauliflower") == "peppers sweet raw"
    assert nutrition_search_query("Dưa leo", "cucumber slices") == "cucumber raw"
    assert nutrition_search_query("Cà chua cocktail", "tomato cocktail") == "tomatoes red raw"
    assert nutrition_search_query("Thịt kho trứng", "chocolate cake") == "Thịt kho trứng"


def test_common_vietnamese_ingredients_have_local_snapshot_queries():
    assert nutrition_search_query("Nước lọc", "supplement") == "water bottled generic"
    assert nutrition_search_query("Nước tương", "soy sauce") == "soy sauce"
    assert nutrition_search_query("Trứng gà", "egg") == "egg whole cooked"


def test_model_safety_flags_are_not_discarded_during_normalization():
    parsed = parse_vision_result({
        "foods": [{"name_vi": "Trứng lòng đào", "search_name_en": "soft boiled egg",
                   "estimated_grams": 50, "confidence": 0.8,
                   "food_groups": ["protein"], "safety_flags": ["raw_or_undercooked"]}],
        "needs_user_confirmation": [],
    })

    assert parsed["foods"][0]["safety_flags"] == ["raw_or_undercooked"]


def test_valid_detailed_vietnamese_food_name_is_preserved_verbatim():
    parsed = parse_vision_result({
        "foods": [{"name_vi": "Cá hồi áp chảo", "search_name_en": "pan fried salmon",
                   "estimated_grams": 120, "confidence": 0.9,
                   "food_groups": ["protein"], "safety_flags": []}],
        "needs_user_confirmation": ["Please confirm portion 😊"],
    })

    assert parsed["foods"][0]["name_vi"] == "Cá hồi áp chảo"
    assert all("Please" not in question for question in parsed["needs_user_confirmation"])


@pytest.mark.parametrize("english_name", ["Pasta carbonara", "Avocado toast", "Omelette"])
def test_unmapped_english_food_names_fail_closed_for_vietnamese_ui(english_name):
    parsed = parse_vision_result({
        "foods": [{"name_vi": english_name, "search_name_en": english_name,
                   "estimated_grams": 120, "confidence": 0.8,
                   "food_groups": ["other"], "safety_flags": []}],
        "needs_user_confirmation": [],
    })
    assert parsed["foods"][0]["name_vi"] == "Món cần Mẹ xác nhận"


def test_nutrition_aliases_only_match_a_complete_food_name():
    assert nutrition_search_query("Rau luộc") == "vegetables mixed cooked boiled"
    assert nutrition_search_query("Thịt bò xào") == "beef flank cooked braised"
    assert nutrition_search_query("Cơm gạo lứt với thịt bò") == "Cơm gạo lứt với thịt bò"
