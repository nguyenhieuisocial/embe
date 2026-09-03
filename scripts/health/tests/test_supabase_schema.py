from pathlib import Path
import re
import unittest


class SupabaseSchemaIntegrityTests(unittest.TestCase):
    def test_sql_files_do_not_contain_diff_markers_before_statements(self) -> None:
        root = Path(__file__).resolve().parents[3]
        sql_files = [
            *sorted((root / "supabase" / "schemas").glob("*.sql")),
            *sorted((root / "supabase" / "migrations").glob("*.sql")),
        ]
        statement = re.compile(
            r"^[+-](?:CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT|INSERT|UPDATE|DELETE|SELECT|BEGIN|COMMIT|WITH)\b",
            re.IGNORECASE,
        )
        invalid = [
            f"{path.relative_to(root)}:{line_number}"
            for path in sql_files
            for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
            if statement.match(line)
        ]
        self.assertEqual([], invalid, f"SQL contains accidental diff markers: {', '.join(invalid)}")


if __name__ == "__main__":
    unittest.main()
