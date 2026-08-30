import io
import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_procurement.csv_provider import CsvQuoteError, read_verified_quotes


class CsvQuoteProviderTests(unittest.TestCase):
    def test_reads_human_verified_quote_without_checkout_automation(self):
        source = io.StringIO(
            "listing_id,unit_price,currency,valid_until,verified,source_ref\n"
            "diaper-cn,108.50,CNY,2026-09-02T00:00:00Z,true,manual-20260831\n"
        )

        quotes = read_verified_quotes(source, now=datetime(2026, 8, 31, tzinfo=timezone.utc))

        self.assertEqual(len(quotes), 1)
        self.assertEqual(quotes[0].listing_id, "diaper-cn")
        self.assertEqual(quotes[0].unit_price, Decimal("108.50"))

    def test_rejects_row_not_confirmed_by_a_human(self):
        source = io.StringIO(
            "listing_id,unit_price,currency,valid_until,verified,source_ref\n"
            "diaper-cn,108.50,CNY,2026-09-02T00:00:00Z,false,auto-scrape\n"
        )

        with self.assertRaises(CsvQuoteError):
            read_verified_quotes(source, now=datetime(2026, 8, 31, tzinfo=timezone.utc))

    def test_rejects_expired_csv_quote(self):
        source = io.StringIO(
            "listing_id,unit_price,currency,valid_until,verified,source_ref\n"
            "diaper-cn,108.50,CNY,2026-08-30T00:00:00Z,true,manual\n"
        )

        with self.assertRaises(CsvQuoteError):
            read_verified_quotes(source, now=datetime(2026, 8, 31, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
