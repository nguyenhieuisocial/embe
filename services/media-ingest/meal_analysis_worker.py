from __future__ import annotations

import argparse
import base64
import hashlib
import ipaddress
import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

MAX_BYTES = 12_000_000
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
FOOD_GROUPS = {"starch", "protein", "vegetables", "fruit", "dairy", "fat", "other"}
SAFETY_FLAGS = {
    "raw_or_undercooked", "unpasteurized", "high_mercury_possible", "alcohol", "unknown"
}

VIETNAMESE_FOOD_NAMES = (
    ("roasted cauliflower", "Súp lơ nướng"),
    ("roasted broccoli", "Bông cải xanh nướng"),
    ("roasted carrots", "Cà rốt nướng"),
    ("cucumber slices", "Dưa leo"),
    ("fried rice with egg", "Cơm chiên trứng"),
    ("egg fried rice", "Cơm chiên trứng"),
    ("fried rice", "Cơm chiên"),
    ("white rice", "Cơm trắng"),
    ("brown rice", "Cơm gạo lứt"),
    ("grilled chicken", "Gà nướng"),
    ("grilled beef", "Thịt bò nướng"),
    ("fried chicken", "Gà chiên"),
    ("chicken breast", "Ức gà"),
    ("boiled egg", "Trứng luộc"),
    ("fried egg", "Trứng chiên"),
    ("salmon", "Cá hồi"),
    ("shrimp", "Tôm"),
    ("tofu", "Đậu hũ"),
    ("vegetable soup", "Canh rau"),
    ("bell pepper", "Ớt chuông"),
    ("cauliflower", "Súp lơ"),
    ("broccoli", "Bông cải xanh"),
    ("cucumber", "Dưa leo"),
    ("tomato", "Cà chua"),
    ("carrot", "Cà rốt"),
    ("dipping sauce", "Nước chấm"),
    ("salad", "Rau trộn"),
    ("banana", "Chuối"),
    ("apple", "Táo"),
    ("yogurt", "Sữa chua"),
    ("milk", "Sữa"),
)
VIETNAMESE_NAME_MARKERS = set("ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ")
VIETNAMESE_NUTRITION_QUERIES = (
    ("cơm chiên trứng", "fried rice restaurant chinese"),
    ("cơm gạo lứt", "rice brown long grain cooked"),
    ("cơm chiên", "fried rice restaurant chinese"),
    ("cơm trắng", "rice white long grain cooked"),
    ("đậu hũ", "tofu raw firm calcium"),
    ("đậu phụ", "tofu raw firm calcium"),
    ("trứng chiên", "egg whole cooked fried"),
    ("trứng luộc", "egg whole cooked hard boiled"),
    ("ức gà", "chicken breast meat only cooked roasted"),
    ("gà nướng", "chicken breast meat only cooked grilled"),
    ("cá hồi", "salmon fish cooked dry heat"),
    ("sữa chua", "plain yogurt"),
    ("chuối", "bananas raw"),
    ("táo", "apples raw skin"),
    ("rau luộc", "vegetables mixed cooked boiled"),
    ("thịt bò xào", "beef flank cooked braised"),
    ("bún cá", "fish noodle soup"),
    ("khoai lang", "sweet potato cooked"),
    ("ớt chuông", "peppers sweet raw"),
    ("súp lơ", "cauliflower cooked"),
    ("súp lơ nướng", "cauliflower cooked"),
    ("bông cải xanh", "broccoli cooked"),
    ("bông cải xanh nướng", "broccoli cooked"),
    ("cà rốt", "carrots cooked"),
    ("cà rốt nướng", "carrots cooked"),
    ("dưa leo", "cucumber raw"),
    ("cà chua", "tomatoes red raw"),
    ("thịt bò nướng", "beef flank cooked braised"),
    ("nước lọc", "water bottled generic"),
    ("nước suối", "water bottled generic"),
    ("nước tương", "soy sauce"),
    ("xì dầu", "soy sauce"),
    ("trứng gà", "egg whole cooked"),
)

VIETNAMESE_NUTRITION_PREFIX_QUERIES = (
    ("ớt chuông", "peppers sweet raw"),
    ("dưa leo", "cucumber raw"),
    ("cà chua", "tomatoes red raw"),
    ("súp lơ", "cauliflower cooked"),
    ("bông cải xanh", "broccoli cooked"),
)


def vietnamese_food_name(name: str, search_name: str) -> tuple[str, bool]:
    """Keep Vietnamese output, localize common English labels, otherwise request correction."""
    normalized_name = name.casefold()
    if any(character in VIETNAMESE_NAME_MARKERS for character in normalized_name):
        return name.strip(), False
    combined = f"{name} {search_name}".casefold()
    for english, vietnamese in VIETNAMESE_FOOD_NAMES:
        if english in combined:
            return vietnamese, False
    return "Món cần Mẹ xác nhận", True


def nutrition_search_query(name_vi: str, search_name_en: str | None = None) -> str:
    """Prefer the user-visible Vietnamese identity over an untrusted AI lookup label."""
    normalized = " ".join(name_vi.casefold().split())
    for vietnamese, english in VIETNAMESE_NUTRITION_QUERIES:
        if vietnamese == normalized:
            return english
    for vietnamese, english in VIETNAMESE_NUTRITION_PREFIX_QUERIES:
        if normalized.startswith(f"{vietnamese} "):
            return english
    if any(character in VIETNAMESE_NAME_MARKERS for character in normalized):
        return name_vi.strip()
    return (search_name_en if search_name_en is not None else name_vi).strip()


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


Transport = Callable[[str, str, Mapping[str, str], bytes | None], HttpResponse]


def default_transport(method: str, url: str, headers: Mapping[str, str], body: bytes | None = None) -> HttpResponse:
    request = Request(url, method=method, headers=dict(headers), data=body)
    try:
        with urlopen(request, timeout=120) as response:
            raw = response.read(MAX_BYTES + 1)
            return HttpResponse(response.status, dict(response.headers.items()), raw)
    except HTTPError as error:
        return HttpResponse(error.code, dict(error.headers.items()), error.read(4096))


def _loopback_http(value: str) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme != "http" or parsed.username or parsed.password or not parsed.hostname:
            return False
        return parsed.hostname == "localhost" or ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        return False


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_secret_key: str
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3-vl:4b-instruct"
    fdc_api_key: str = "DEMO_KEY"
    nutrition_cache_path: str = ":memory:"
    nutrition_local_db_path: str = ""
    bucket: str = "embe-meal-inbox"

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Config":
        supabase = env.get("SUPABASE_URL", "").rstrip("/")
        secret = env.get("SUPABASE_SECRET_KEY", "")
        ollama = env.get("EMBE_MEAL_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        model = env.get("EMBE_MEAL_VISION_MODEL", "qwen3-vl:4b-instruct").strip()
        fdc_api_key = env.get("USDA_FDC_API_KEY", "DEMO_KEY").strip()
        cache_path = env.get("EMBE_NUTRITION_CACHE", r"C:\EmBe\data\cache\fooddata-central.sqlite").strip()
        local_db_path = env.get("EMBE_NUTRITION_LOCAL_DB", r"C:\EmBe\data\cache\fooddata-sr-legacy.sqlite").strip()
        if urlparse(supabase).scheme != "https" or not secret:
            raise ValueError("meal worker Supabase configuration is incomplete")
        if not _loopback_http(ollama):
            raise ValueError("meal image inference must stay on loopback")
        if not re.fullmatch(r"[a-zA-Z0-9._:-]{1,80}", model):
            raise ValueError("invalid meal vision model")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{8,120}", fdc_api_key):
            raise ValueError("invalid USDA FoodData Central API key")
        if not cache_path:
            raise ValueError("invalid nutrition cache path")
        return cls(supabase, secret, ollama, model, fdc_api_key, cache_path, local_db_path)


class WorkerFailure(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def validate_image(body: bytes, mime_type: str) -> None:
    if not 1 <= len(body) <= MAX_BYTES:
        raise WorkerFailure("invalid_image_size")
    valid = (
        (mime_type == "image/jpeg" and body.startswith(b"\xff\xd8\xff"))
        or (mime_type == "image/png" and body.startswith(b"\x89PNG\r\n\x1a\n"))
        or (mime_type == "image/webp" and len(body) >= 12 and body[:4] == b"RIFF" and body[8:12] == b"WEBP")
    )
    if not valid:
        raise WorkerFailure("invalid_image_signature")


def parse_vision_result(value: Any) -> dict[str, Any]:
    if (not isinstance(value, dict)
            or not {"foods", "needs_user_confirmation"} <= set(value)
            or set(value) - {"foods", "needs_user_confirmation", "estimate_notice", "nutrition"}):
        raise ValueError("invalid_vision_result")
    foods = value.get("foods")
    questions = value.get("needs_user_confirmation")
    if not isinstance(foods, list) or not 1 <= len(foods) <= 8 or not isinstance(questions, list) or len(questions) > 6:
        raise ValueError("invalid_vision_result")
    normalized_foods: list[dict[str, Any]] = []
    needs_name_confirmation = False
    for food in foods:
        if not isinstance(food, dict) or set(food) != {
            "name_vi", "search_name_en", "estimated_grams", "confidence", "food_groups", "safety_flags"
        }:
            raise ValueError("invalid_vision_result")
        name_vi = food["name_vi"]
        search_name = food["search_name_en"]
        grams = food["estimated_grams"]
        confidence = food["confidence"]
        groups = food["food_groups"]
        flags = food["safety_flags"]
        if (
            not isinstance(name_vi, str) or not 1 <= len(name_vi.strip()) <= 80
            or not isinstance(search_name, str) or not 1 <= len(search_name.strip()) <= 100
            or (grams is not None and (not isinstance(grams, (int, float)) or not 1 <= grams <= 3000))
            or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1
            or not isinstance(groups, list) or not groups or len(groups) > 4 or not set(groups) <= FOOD_GROUPS
            or not isinstance(flags, list) or len(flags) > 4 or not set(flags) <= SAFETY_FLAGS
        ):
            raise ValueError("invalid_vision_result")
        safety_text = f"{name_vi} {search_name}".casefold()
        derived_flags: list[str] = []
        if any(term in safety_text for term in ("rượu", "bia", "wine", "beer", "alcohol")):
            derived_flags.append("alcohol")
        if any(term in safety_text for term in ("cá kiếm", "cá mập", "cá thu vua", "swordfish", "shark", "king mackerel", "tilefish")):
            derived_flags.append("high_mercury_possible")
        if float(confidence) < 0.5:
            derived_flags.append("unknown")
        localized_name, food_needs_name_confirmation = vietnamese_food_name(name_vi.strip(), search_name.strip())
        needs_name_confirmation = needs_name_confirmation or food_needs_name_confirmation
        normalized_foods.append({
            "name_vi": localized_name, "search_name_en": search_name.strip(),
            "estimated_grams": round(float(grams), 1) if grams is not None else None,
            "confidence": round(float(confidence), 2),
            "food_groups": list(dict.fromkeys(groups)),
            "safety_flags": list(dict.fromkeys([*flags, *derived_flags])),
        })
    if any(not isinstance(question, str) or not 1 <= len(question.strip()) <= 120 for question in questions):
        raise ValueError("invalid_vision_result")
    distinct: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for food in normalized_foods:
        identity = (food["name_vi"].casefold(), food["search_name_en"].casefold())
        if identity not in seen:
            distinct.append(food)
            seen.add(identity)
    confirmations: list[str] = []
    if needs_name_confirmation:
        confirmations.append("Nhập lại tên món bằng tiếng Việt.")
    all_groups = {group for food in distinct for group in food["food_groups"]}
    if "protein" in all_groups and "Thịt, cá, trứng hoặc hải sản đã nấu chín kỹ chưa?" not in confirmations:
        confirmations.append("Thịt, cá, trứng hoặc hải sản đã nấu chín kỹ chưa?")
    if "dairy" in all_groups and "Sữa hoặc chế phẩm sữa có ghi đã tiệt trùng không?" not in confirmations:
        confirmations.append("Sữa hoặc chế phẩm sữa có ghi đã tiệt trùng không?")
    return {
        "foods": distinct,
        "needs_user_confirmation": confirmations[:6],
        "estimate_notice": "Ước lượng từ ảnh; cần xác nhận món và khẩu phần trước khi lưu.",
    }


PROMPT = """Bạn đang tạo bản nháp nhật ký bữa ăn cho một phụ nữ đang mang thai.
Chỉ trích xuất món có căn cứ trực tiếp từ ảnh hoặc ghi chú. Không chẩn đoán, không kê bổ sung, không khẳng định thiếu chất,
không tự đặt mục tiêu calorie. Trường name_vi bắt buộc là tiếng Việt tự nhiên có dấu, ví dụ
"Cơm chiên trứng", "Cá hồi áp chảo"; tuyệt đối không điền tên tiếng Anh vào trường này.
Trường search_name_en mới dùng cụm tìm kiếm nguyên liệu tương đương bằng tiếng Anh.
Mỗi cặp name_vi và search_name_en phải là cùng một thực phẩm; tự kiểm tra lại từng cặp trước khi trả lời.
Ví dụ ớt chuông là "peppers sweet raw", tuyệt đối không phải cauliflower; nước lọc là water, không phải supplement.
Ưu tiên tên món Việt Nam quen dùng (phở, bún, cơm tấm, bánh mì, canh, món kho/xào/luộc) thay vì dịch từng nguyên liệu.
Nhìn toàn bộ khay hoặc đĩa trước, tách các món nhìn thấy rõ nhưng không tách gia vị và đồ trang trí thành món riêng.
Ghi chú của người dùng là gợi ý để phân biệt món; không dùng ghi chú để bịa món trái với ảnh.
Ước lượng gram phần ăn được, không tính đĩa/tô/ly; nếu không đủ căn cứ thì dùng null. Mỗi món chỉ xuất hiện
một lần, không lặp và không điền thêm cho đủ số lượng. Đánh dấu an toàn chỉ khi có dấu hiệu thực sự
hoặc cần người dùng xác nhận. Trả về đúng JSON theo schema, tối đa 8 món phân biệt."""


class MealAnalysisWorker:
    def __init__(self, config: Config, transport: Transport = default_transport):
        self.config = config
        self.transport = transport

    @property
    def supabase_headers(self) -> dict[str, str]:
        return {
            "accept": "application/json", "content-type": "application/json",
            "apikey": self.config.supabase_secret_key,
            "authorization": f"Bearer {self.config.supabase_secret_key}",
        }

    def _rpc(self, name: str, payload: Mapping[str, object]) -> Any:
        response = self.transport("POST", f"{self.config.supabase_url}/rest/v1/rpc/{name}",
                                  self.supabase_headers, json.dumps(payload, ensure_ascii=False).encode())
        if not 200 <= response.status < 300:
            raise RuntimeError("meal queue operation failed")
        return json.loads(response.body) if response.body else None

    def report_heartbeat(self, result: Mapping[str, object]) -> None:
        status = str(result.get("status", "idle"))
        self._rpc("embe_touch_worker_heartbeat", {
            "p_worker_name": "meal-analysis",
            "p_state": "degraded" if status == "retry" else "online",
            "p_detail": status[:80],
        })

    def prewarm(self) -> None:
        response = self.transport(
            "POST", f"{self.config.ollama_url}/api/chat", {"content-type": "application/json"},
            json.dumps({
                "model": self.config.ollama_model, "stream": False, "keep_alive": "24h",
            }).encode(),
        )
        if response.status != 200:
            raise WorkerFailure("vision_unavailable")

    def _download(self, item: Mapping[str, object]) -> bytes:
        encoded = "/".join(quote(part, safe="") for part in str(item["storage_path"]).split("/"))
        response = self.transport("GET", f"{self.config.supabase_url}/storage/v1/object/authenticated/{self.config.bucket}/{encoded}",
                                  self.supabase_headers)
        if response.status != 200 or len(response.body) != int(item["byte_size"]):
            raise WorkerFailure("staging_download_failed")
        validate_image(response.body, str(item["mime_type"]))
        return response.body

    def _analyze(self, body: bytes | None, note: str) -> dict[str, Any]:
        schema = {
            "type": "object", "required": ["foods", "needs_user_confirmation"],
            "additionalProperties": False,
            "properties": {
                "foods": {
                    "type": "array", "minItems": 0 if body is None else 1, "maxItems": 8,
                    "items": {
                        "type": "object", "additionalProperties": False,
                        "required": ["name_vi", "search_name_en", "estimated_grams", "confidence", "food_groups", "safety_flags"],
                        "properties": {
                            "name_vi": {"type": "string", "minLength": 1, "maxLength": 80},
                            "search_name_en": {"type": "string", "minLength": 1, "maxLength": 100},
                            "estimated_grams": {"type": ["number", "null"], "minimum": 1, "maximum": 3000},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                            "food_groups": {"type": "array", "minItems": 1, "maxItems": 4,
                                            "items": {"type": "string", "enum": sorted(FOOD_GROUPS)}},
                            "safety_flags": {"type": "array", "maxItems": 4,
                                             "items": {"type": "string", "enum": sorted(SAFETY_FLAGS)}},
                        },
                    },
                },
                "needs_user_confirmation": {"type": "array", "maxItems": 6, "items": {"type": "string"}},
            },
        }
        message: dict[str, Any] = {
            "role": "user",
            "content": f"{PROMPT}\n{'Chỉ trích xuất món được viết rõ trong ghi chú.' if body is None else 'Đối chiếu cả ảnh và ghi chú.'}\nGhi chú của người dùng: {note[:300] or '(không có)'}",
        }
        if body is not None:
            message["images"] = [base64.b64encode(body).decode()]
        payload = {
            "model": self.config.ollama_model, "stream": False, "think": False, "format": schema,
            "keep_alive": "24h", "options": {"temperature": 0, "num_predict": 512},
            "messages": [message],
        }
        response = self.transport("POST", f"{self.config.ollama_url}/api/chat",
                                  {"content-type": "application/json"}, json.dumps(payload, ensure_ascii=False).encode())
        if response.status != 200:
            raise WorkerFailure("vision_unavailable" if body is not None else "text_analysis_unavailable")
        try:
            outer = json.loads(response.body)
            raw_result = json.loads(outer["message"]["content"])
            if body is None and isinstance(raw_result, dict) and raw_result.get("foods") == []:
                questions = raw_result.get("needs_user_confirmation")
                if (set(raw_result) - {"foods", "needs_user_confirmation"}
                        or not isinstance(questions, list)
                        or len(questions) > 6
                        or any(not isinstance(question, str) or not 1 <= len(question.strip()) <= 120
                               for question in questions)):
                    raise ValueError("invalid_text_analysis_result")
                return {
                    "entry_mode": "note", "foods": [],
                    "needs_user_confirmation": [question.strip() for question in questions],
                    "estimate_notice": "Không thấy món cụ thể nên EmBe không tự đoán. Mẹ có thể thêm món hoặc chỉ lưu ghi chú.",
                }
            result = parse_vision_result(raw_result)
            if body is None:
                result["estimate_notice"] = "Ước lượng từ ghi chú; cần xác nhận món và khẩu phần trước khi lưu."
            return result
        except (KeyError, TypeError, json.JSONDecodeError, ValueError) as error:
            raise WorkerFailure("invalid_vision_output" if body is not None else "invalid_text_analysis_output") from error

    def _lookup_local_food(self, query: str) -> dict[str, Any] | None:
        if not self.config.nutrition_local_db_path:
            return None
        path = Path(self.config.nutrition_local_db_path)
        if not path.is_file():
            return None
        tokens = re.findall(r"[a-z0-9]+", query.casefold())[:8]
        if not tokens:
            return None
        try:
            connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True, timeout=5)
            row = connection.execute(
                "SELECT foods.fdc_id, foods.description, foods.calories, foods.protein_g, foods.fat_g, "
                "foods.carbs_g, foods.fiber_g, foods.calcium_mg, foods.iron_mg, foods.folate_ug "
                "FROM food_search JOIN foods ON foods.fdc_id = food_search.rowid "
                "WHERE food_search MATCH ? ORDER BY bm25(food_search) LIMIT 1",
                (" ".join(f'\"{token}\"' for token in tokens),),
            ).fetchone()
            connection.close()
        except sqlite3.Error as error:
            raise WorkerFailure("nutrition_local_db_invalid") from error
        if not row:
            return None
        nutrient_ids = (1008, 1003, 1004, 1005, 1079, 1087, 1089, 1177)
        nutrients = [
            {"nutrientId": nutrient_id, "value": value}
            for nutrient_id, value in zip(nutrient_ids, row[2:]) if value is not None
        ]
        return {"fdcId": row[0], "description": row[1], "foodNutrients": nutrients, "localSnapshot": True}

    def _lookup_food(self, query: str) -> dict[str, Any] | None:
        local_match = self._lookup_local_food(query)
        if self.config.nutrition_local_db_path and Path(self.config.nutrition_local_db_path).is_file():
            return local_match
        cache_path = Path(self.config.nutrition_cache_path) if self.config.nutrition_cache_path != ":memory:" else None
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_key = " ".join(query.casefold().split())
        try:
            connection = sqlite3.connect(self.config.nutrition_cache_path, timeout=15)
            connection.execute("PRAGMA busy_timeout = 15000")
            connection.execute("CREATE TABLE IF NOT EXISTS food_cache (query TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL)")
            cached = connection.execute("SELECT payload, fetched_at FROM food_cache WHERE query = ?", (cache_key,)).fetchone()
            if cached and int(cached[1]) >= int(time.time()) - 180 * 86_400:
                connection.close()
                return json.loads(cached[0])
            connection.close()
        except (OSError, sqlite3.Error, json.JSONDecodeError) as error:
            raise WorkerFailure("nutrition_cache_unavailable") from error
        params = urlencode({
            "api_key": self.config.fdc_api_key, "query": query,
            "pageSize": 1, "dataType": "Foundation,SR Legacy",
        })
        response = self.transport("GET", f"https://api.nal.usda.gov/fdc/v1/foods/search?{params}",
                                  {"accept": "application/json"})
        if response.status in {408, 425, 429, 500, 502, 503, 504}:
            connection.close()
            raise WorkerFailure("nutrition_provider_unavailable")
        if response.status != 200:
            connection.close()
            return None
        try:
            value = json.loads(response.body)
            foods = value.get("foods", [])
            match = foods[0] if isinstance(foods, list) and foods and isinstance(foods[0], dict) else None
            try:
                connection = sqlite3.connect(self.config.nutrition_cache_path, timeout=15)
                connection.execute("PRAGMA busy_timeout = 15000")
                connection.execute("CREATE TABLE IF NOT EXISTS food_cache (query TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL)")
                connection.execute(
                    "INSERT INTO food_cache(query, payload, fetched_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(query) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at",
                    (cache_key, json.dumps(match, ensure_ascii=False), int(time.time())),
                )
                connection.commit()
                connection.close()
            except (OSError, sqlite3.Error) as error:
                raise WorkerFailure("nutrition_cache_unavailable") from error
            return match
        except (json.JSONDecodeError, AttributeError):
            raise WorkerFailure("nutrition_provider_invalid")

    @staticmethod
    def _nutrients(food: Mapping[str, Any]) -> dict[str, float]:
        wanted_ids = {
            "1008": "calories", "1003": "protein_g", "1004": "fat_g", "1005": "carbs_g",
            "1079": "fiber_g", "1087": "calcium_mg", "1089": "iron_mg", "1177": "folate_ug",
        }
        wanted_legacy_numbers = {
            "208": "calories", "203": "protein_g", "204": "fat_g", "205": "carbs_g",
            "291": "fiber_g", "301": "calcium_mg", "303": "iron_mg", "435": "folate_ug",
        }
        result: dict[str, float] = {}
        for item in food.get("foodNutrients", []):
            if not isinstance(item, dict):
                continue
            nutrient_id = str(item.get("nutrientId") or "")
            legacy_number = str(item.get("nutrientNumber") or "")
            name = wanted_ids.get(nutrient_id) or wanted_legacy_numbers.get(legacy_number)
            value = item.get("value")
            if name and isinstance(value, (int, float)) and value >= 0:
                result[name] = float(value)
        return result

    def _calculate_nutrition(self, analysis: Any) -> dict[str, Any]:
        parsed = parse_vision_result(analysis)
        items: list[dict[str, Any]] = []
        totals = {key: 0.0 for key in ("calories", "protein_g", "fat_g", "carbs_g", "fiber_g", "calcium_mg", "iron_mg", "folate_ug")}
        uncertainty_weight = 0.0
        weight = 0.0
        unresolved = 0
        for food in parsed["foods"]:
            grams = food["estimated_grams"]
            try:
                query = nutrition_search_query(food["name_vi"], food["search_name_en"])
                match = self._lookup_food(query) if grams is not None else None
            except WorkerFailure as error:
                if error.code != "nutrition_provider_unavailable":
                    raise
                match = None
            if grams is not None and not match:
                unresolved += 1
            per_100g = self._nutrients(match or {})
            scaled = {key: round(value * float(grams) / 100, 1) for key, value in per_100g.items()} if grams else {}
            for key, value in scaled.items():
                totals[key] += value
            if grams:
                weight += float(grams)
                uncertainty_weight += float(grams) * (0.25 + (1 - food["confidence"]) * 0.5)
            items.append({
                "name_vi": food["name_vi"], "grams": grams,
                "fdc_id": match.get("fdcId") if match else None,
                "source_description": match.get("description") if match else None,
                "nutrients": scaled or None,
            })
        uncertainty = min(0.65, max(0.25, uncertainty_weight / weight if weight else 0.5))
        rounded_totals = {key: round(value, 1) for key, value in totals.items() if value > 0}
        calories = rounded_totals.get("calories")
        calorie_range = None if calories is None else {
            "low": max(0, round(calories * (1 - uncertainty))),
            "mid": round(calories), "high": round(calories * (1 + uncertainty)),
        }
        status = "estimated" if rounded_totals else "unavailable"
        notice = "Ước lượng sau khi xác nhận món và khẩu phần; không phải mục tiêu calorie hoặc chẩn đoán thiếu chất."
        if unresolved:
            notice += f" Có {unresolved} món chưa ghép được nguồn dinh dưỡng nên không được cộng vào tổng."
        return {
            "status": status, "source": "USDA FoodData Central (local SR Legacy + API)",
            "items": items, "totals": rounded_totals, "calorie_range": calorie_range,
            "notice": notice,
        }

    def _run_nutrition_once(self) -> dict[str, object]:
        item = self._rpc("embe_claim_meal_nutrition", {})
        if item is None:
            return {"status": "idle"}
        if not isinstance(item, dict) or not UUID.match(str(item.get("id", ""))):
            raise RuntimeError("invalid meal nutrition queue response")
        entry_id = str(item["id"])
        try:
            nutrition = self._calculate_nutrition(item.get("analysis"))
            self._rpc("embe_finish_meal_nutrition", {"p_id": entry_id, "p_nutrition": nutrition})
            return {"status": "confirmed", "entry_id": entry_id, "matched": sum(1 for value in nutrition["items"] if value["fdc_id"])}
        except WorkerFailure as error:
            attempts = int(item.get("attempts", 1))
            retry_seconds = min(86_400, 60 * (2 ** min(attempts - 1, 10)))
            self._rpc("embe_fail_meal_nutrition", {
                "p_id": entry_id, "p_error_code": error.code, "p_retry_after_seconds": retry_seconds,
            })
            return {"status": "retry", "entry_id": entry_id, "error": error.code}

    def run_once(self) -> dict[str, object]:
        item = self._rpc("embe_claim_meal_analysis", {})
        if item is None:
            return self._run_nutrition_once()
        if not isinstance(item, dict) or not UUID.match(str(item.get("id", ""))):
            raise RuntimeError("invalid meal queue response")
        entry_id = str(item["id"])
        try:
            note = str(item.get("note", ""))
            has_image = bool(item.get("storage_path"))
            body = self._download(item) if has_image else None
            analysis = self._analyze(body, note)
            checksum_source = body if body is not None else note.encode("utf-8")
            self._rpc("embe_finish_meal_analysis", {
                "p_id": entry_id, "p_checksum_sha256": hashlib.sha256(checksum_source).hexdigest(),
                "p_model_name": self.config.ollama_model, "p_analysis": analysis,
            })
            return {"status": "review", "entry_id": entry_id, "food_count": len(analysis["foods"])}
        except WorkerFailure as error:
            attempts = int(item.get("attempts", 1))
            retry_seconds = min(86_400, 60 * (2 ** min(attempts - 1, 10)))
            self._rpc("embe_fail_meal_analysis", {
                "p_id": entry_id, "p_error_code": error.code, "p_retry_after_seconds": retry_seconds,
            })
            return {"status": "retry", "entry_id": entry_id, "error": error.code}


def _load_env(path: Path) -> dict[str, str]:
    values = dict(os.environ)
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def _write_status(path: Path, result: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps({**result, "last_run_epoch": int(time.time())}, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


def run_worker_loop(worker: MealAnalysisWorker, status_path: Path, poll_interval: float = 2,
                    heartbeat_interval: float = 60, sleep: Callable[[float], None] = time.sleep,
                    monotonic: Callable[[], float] = time.monotonic,
                    max_iterations: int | None = None) -> None:
    last_heartbeat = monotonic() - heartbeat_interval
    try:
        worker.prewarm()
    except WorkerFailure:
        pass
    iteration = 0
    while max_iterations is None or iteration < max_iterations:
        iteration += 1
        try:
            result = worker.run_once()
        except Exception:
            result = {"status": "retry", "error": "worker_unavailable"}
        now = monotonic()
        heartbeat_due = now - last_heartbeat >= heartbeat_interval
        if heartbeat_due:
            try:
                worker.report_heartbeat(result)
                last_heartbeat = now
            except Exception:
                result = {"status": "retry", "error": "heartbeat_unavailable"}
        if result.get("status") != "idle" or heartbeat_due:
            _write_status(status_path, result)
        if result.get("status") in {"idle", "retry"} and (max_iterations is None or iteration < max_iterations):
            sleep(poll_interval)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create private, review-first food-photo drafts with loopback Ollama.")
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\meal-analysis-worker.json"))
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args(argv)
    worker = MealAnalysisWorker(Config.from_env(_load_env(args.env)))
    if args.watch:
        run_worker_loop(worker, args.status)
        return 0
    result = worker.run_once()
    worker.report_heartbeat(result)
    _write_status(args.status, result)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
