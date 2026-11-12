<div align="center">

![USB Activity Forensic Analyzer](assets/banner.svg)

# USB Device Activity Forensic Analyzer

**Turn prepared USB activity records into an investigation starting point.**

`Python` · `Tkinter` · `Pandas` · `Matplotlib` · `Local-first` · `v1.0.0`

[Getting started](#getting-started) · [CSV format](docs/INPUTS.md) · [Upgrade roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)

</div>

---

An offline desktop workspace for students and early-career analysts to explore **prepared USB activity CSVs**. Review the timeline, compare device IDs, and identify repeated connection records worth investigating.

| Workspace | What it shows |
| --- | --- |
| **Overview** | Record counts, connection records, device IDs, repeated IDs, activity charts. |
| **Timeline & devices** | Chronological records, searchable views, first/last observed times, connection counts. |
| **Data quality** | Source SHA-256, skipped rows, missing fields, and timezone assumptions. |
| **Exports** | Filtered event CSV and a plain-text triage report with source and limitations. |

The application processes files locally and does not send them to a server. It does not save cases automatically. The source CSV is read without being modified; exported files are saved only when you choose a destination.

## Getting started

**Requirements:** Python 3.10–3.12 with Tkinter, and the packages in `requirements.txt`. On some Linux systems Tkinter is supplied by a separate `python3-tk` package. Installing Python packages requires internet access; the application itself works offline.

Download or clone the repository, open a terminal in its folder, and run:

```bash
python -m venv .venv
```

Activate the environment:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

Install the dependencies and start the app:

```bash
python -m pip install -r requirements.txt
python app.py
```

1. Select **Load sample** to explore fictional records, or **Import CSV** to open an authorized, prepared CSV.
2. Before import, enter the fixed UTC offset for timestamps that lack one; the default is `+00:00`. Times with their own offsets are converted using those offsets.
3. Apply filters, inspect **Data quality**, then export the filtered CSV or report if needed. Exports reflect the **applied** filters.

The sample intentionally contains one invalid timestamp and one missing device ID to demonstrate data-quality handling. See the [input guide](docs/INPUTS.md) before using your own evidence.

## Evidence and limitations

> **This is a triage aid, not an authorization detector.** A repeated device ID or connection record is a lead for review, not proof of an unauthorized device, physical insertion, file transfer, or compromise.

- v1.0 accepts **prepared UTF-8 CSV** with `timestamp`, `event_type`, and `device_id` columns; it does **not** parse raw `.evtx`, Windows Event Viewer exports, registry hives, or live devices automatically.
- Records and identifiers can be incomplete, duplicated, spoofed, or incorrectly classified upstream. Empty IDs remain in the timeline but are excluded from device counts. The same ID is grouped case-insensitively across computers.
- Timestamps without offsets use your chosen **fixed** offset, which does not model daylight-saving changes. Displayed times are UTC; original timestamp text remains in CSV exports.
- A SHA-256 fingerprint helps compare copies, but it does not establish provenance or a complete chain of custody. Retain the original and validate findings using independent evidence.

## Development

```bash
python -m unittest discover -s tests -v
```

Read the [CSV input guide](docs/INPUTS.md) for event labels, limits, and exported fields. The [numbered roadmap](docs/ROADMAP.md) orders future upgrades by dependency and importance.

---

<div align="center">Created by <strong>Namitesh Pandey</strong> · Cybersecurity learning & portfolio project</div>
