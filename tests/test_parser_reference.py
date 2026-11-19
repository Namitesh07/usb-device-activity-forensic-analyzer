"""Cross-check supported CSV cases against Python's independent stdlib parser."""
import csv
import io
import json
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "Node.js is needed for the JavaScript cross-check")
class ParserReferenceTests(unittest.TestCase):
    def test_csv_matches_python_reader_for_fictional_sources(self):
        samples = [
            (ROOT / "tests/fixtures/windows-edge.csv").read_text(encoding="utf-8"),
            'timestamp,event_type,device_id\r\n2026-01-01T00:00:00Z,connected,"ID, with comma"\r\n',
            'a,b\n"multi\nline","double ""quote"""\n',
        ]
        for text in samples:
            expected = list(csv.reader(io.StringIO(text, newline=""), strict=True))
            result = subprocess.run(
                ["node", "-e", "const A=require('./analysis.js');let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>console.log(JSON.stringify(A.parseCSV(s))));"],
                cwd=ROOT, input=text, text=True, capture_output=True, check=True,
            )
            self.assertEqual(json.loads(result.stdout), expected)


if __name__ == "__main__":
    unittest.main()
