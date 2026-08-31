from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import sqlite3
import tempfile
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
SOURCE_SHA256 = "b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0"
NUTRIENTS = {
    1008: "calories", 1003: "protein_g", 1004: "fat_g", 1005: "carbs_g",
    1079: "fiber_g", 1087: "calcium_mg", 1089: "iron_mg", 1177: "folate_ug",
}


def member(archive: zipfile.ZipFile, filename: str) -> str:
    matches = [name for name in archive.namelist() if name.endswith(f"/{filename}") or name == filename]
    if len(matches) != 1:
        raise RuntimeError(f"USDA archive is missing {filename}")
    return matches[0]


def rows(archive: zipfile.ZipFile, filename: str):
    with archive.open(member(archive, filename)) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))


def build_database(archive_path: Path, output_path: Path) -> int:
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise RuntimeError("USDA archive checksum does not match the pinned public release")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    if temporary.exists():
        temporary.unlink()
    connection = sqlite3.connect(temporary)
    try:
        connection.executescript("""
          PRAGMA journal_mode = DELETE;
          PRAGMA synchronous = FULL;
          CREATE TABLE foods (
            fdc_id INTEGER PRIMARY KEY, description TEXT NOT NULL,
            calories REAL, protein_g REAL, fat_g REAL, carbs_g REAL,
            fiber_g REAL, calcium_mg REAL, iron_mg REAL, folate_ug REAL
          );
          CREATE VIRTUAL TABLE food_search USING fts5(description, content='foods', content_rowid='fdc_id');
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        with zipfile.ZipFile(archive_path) as archive:
            connection.executemany(
                "INSERT INTO foods(fdc_id, description) VALUES (?, ?)",
                ((int(row["fdc_id"]), row["description"].strip()) for row in rows(archive, "food.csv")),
            )
            updates = []
            for row in rows(archive, "food_nutrient.csv"):
                nutrient_id = int(row["nutrient_id"])
                column = NUTRIENTS.get(nutrient_id)
                if column and row["amount"]:
                    updates.append((column, float(row["amount"]), int(row["fdc_id"])))
            for column in NUTRIENTS.values():
                connection.executemany(
                    f"UPDATE foods SET {column} = ? WHERE fdc_id = ?",
                    ((amount, fdc_id) for nutrient, amount, fdc_id in updates if nutrient == column),
                )
        connection.execute("INSERT INTO food_search(food_search) VALUES ('rebuild')")
        connection.executemany("INSERT INTO metadata(key, value) VALUES (?, ?)", [
            ("source_url", SOURCE_URL), ("source_sha256", SOURCE_SHA256), ("license", "CC0-1.0"),
        ])
        count = int(connection.execute("SELECT count(*) FROM foods").fetchone()[0])
        connection.commit()
        check = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if check != "ok" or count < 7000:
            raise RuntimeError("USDA local database integrity check failed")
    finally:
        connection.close()
    os.replace(temporary, output_path)
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a small, local CC0 USDA nutrition index for EmBe.")
    parser.add_argument("--output", type=Path, default=Path(r"C:\EmBe\data\cache\fooddata-sr-legacy.sqlite"))
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    if args.archive:
        count = build_database(args.archive, args.output)
    else:
        with tempfile.TemporaryDirectory(prefix="embe-usda-") as directory:
            archive = Path(directory) / "usda.zip"
            request = Request(SOURCE_URL, headers={"User-Agent": "EmBe/1.0 nutrition-cache"})
            with urlopen(request, timeout=120) as response, archive.open("wb") as destination:
                while chunk := response.read(1024 * 1024):
                    destination.write(chunk)
            count = build_database(archive, args.output)
    print(json.dumps({"status": "ok", "foods": count, "output": str(args.output)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
