import csv
import hashlib
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from usb_analyzer.analysis import InputError, filter_events, format_utc, load_csv, parse_offset, parse_timestamp, summarize
from usb_analyzer.export import report_text, spreadsheet_safe, write_csv, write_report


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def source(self, text):
        path = self.folder / "events.csv"
        path.write_text(text, encoding="utf-8")
        return path

    def test_sample_counts_and_source_fingerprint(self):
        sample = Path(__file__).resolve().parents[1] / "samples" / "fictional_usb_activity.csv"
        data = load_csv(sample)
        stats = summarize(data.events)
        self.assertEqual(data.total_records, 17)
        self.assertEqual(len(data.events), 16)
        self.assertEqual(len(data.issues), 1)
        self.assertEqual(data.sha256, hashlib.sha256(sample.read_bytes()).hexdigest())
        self.assertEqual(stats["connections"], 9)
        self.assertEqual(len(stats["devices"]), 3)
        self.assertEqual(stats["repeated"], 3)
        self.assertEqual(stats["missing_ids"], 1)

    def test_offsets_fractional_times_and_naive_count(self):
        data = load_csv(self.source("timestamp,event_type,device_id\n2026-01-01T11:30:00+05:30,connected,A\n2026-01-01 11:30:00.123456,connected,A\n"), "+05:30")
        self.assertEqual(format_utc(data.events[0].timestamp), "2026-01-01T06:00:00Z")
        self.assertEqual(format_utc(data.events[1].timestamp), "2026-01-01T06:00:00.123456Z")
        self.assertEqual(data.naive_timestamps, 1)
        with self.assertRaises(InputError):
            parse_offset("UTC")
        with self.assertRaises(ValueError):
            parse_timestamp("2026-01-01", timezone.utc)
        with self.assertRaises(ValueError):
            parse_timestamp("2026-01-01T11:30:00.1234567Z", timezone.utc)

    def test_unknown_type_missing_id_duplicates_and_grouping(self):
        data = load_csv(self.source("timestamp,event_type,device_id,computer\n"
                                    "2026-01-01T00:00:00Z,connected,DEVICE-A,PC\n"
                                    "2026-01-01T00:00:00Z,connected,device-a,PC\n"
                                    "2026-01-01T00:00:01Z,connected,,PC\n"
                                    "2026-01-01T00:00:02Z,observed,DEVICE-A,PC\n"))
        stats = summarize(data.events)
        self.assertEqual(stats["records"], 4)
        self.assertEqual(stats["connections"], 3)
        self.assertEqual(len(stats["devices"]), 1)
        self.assertEqual(stats["devices"][0]["connections"], 2)
        self.assertEqual(stats["devices"][0]["records"], 3)
        self.assertEqual(stats["repeated"], 1)
        self.assertEqual(stats["counts"]["other"], 1)
        self.assertEqual(len(filter_events(data.events, "pc", "connected")), 3)

    def test_invalid_headers_rows_and_empty_input(self):
        with self.assertRaises(InputError):
            load_csv(self.source("TimeCreated,Message\n2026,unknown\n"))
        with self.assertRaises(InputError):
            load_csv(self.source("timestamp,Timestamp,event_type,device_id\na,b,c,d\n"))
        data = load_csv(self.source("timestamp,event_type,device_id\ninvalid,connected,A\n2026-01-01T00:00:00Z,connected,A,EXTRA\n"))
        self.assertEqual(len(data.issues), 2)
        self.assertEqual(summarize(data.events)["records"], 0)

    def test_export_filtered_records_spreadsheet_safety_and_source_protection(self):
        source = self.source("timestamp,event_type,device_id,username\n2026-01-01T00:00:00Z,connected,=2+2,+attacker\n2026-01-01T01:00:00Z,disconnected,A,bob\n")
        before = source.read_bytes()
        data = load_csv(source)
        shown = filter_events(data.events, event_type="connected")
        destination = self.folder / "export.csv"
        write_csv(destination, data, shown)
        with destination.open(encoding="utf-8-sig", newline="") as file:
            rows = list(csv.DictReader(file))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["device_id"], "'=2+2")
        self.assertEqual(rows[0]["username"], "'+attacker")
        self.assertEqual(rows[0]["source_sha256"], data.sha256)
        self.assertEqual(spreadsheet_safe("  @x"), "'  @x")
        with self.assertRaises(ValueError):
            write_csv(source, data, shown)
        with self.assertRaises(ValueError):
            write_report(source, data, shown, "", "connected")
        self.assertEqual(source.read_bytes(), before)
        report = report_text(data, shown, "", "connected")
        self.assertIn("Records: 1", report)
        self.assertIn("not proof of unauthorized use", report)
        self.assertIn(data.sha256, report)

    def test_empty_filter_and_invalid_timezone(self):
        data = load_csv(self.source("timestamp,event_type,device_id\n2026-01-01T00:00:00Z,connected,A\n"))
        self.assertEqual(summarize(filter_events(data.events, "no-match"))["records"], 0)
        with self.assertRaises(InputError):
            load_csv(data.source_path, "+27:00")

    def test_dates_outside_pandas_nanosecond_range(self):
        data = load_csv(self.source("timestamp,event_type,device_id\n1600-01-01T00:00:00Z,connected,A\n"))
        stats = summarize(data.events)
        self.assertEqual(stats["daily"], [("1600-01-01", 1)])
        self.assertEqual(format_utc(stats["devices"][0]["first_seen"]), "1600-01-01T00:00:00Z")
        with self.assertRaises(ValueError):
            parse_timestamp("0001-01-01T00:00:00+23:00", timezone.utc)


if __name__ == "__main__":
    unittest.main()
