<div align="center">

![USB Activity Forensic Analyzer](assets/banner.svg)

# USB Device Activity Forensic Analyzer

**Turn prepared USB activity records into an investigation starting point.**

`Browser-local` · `JavaScript` · `No backend` · `Prepared CSV` · `v1.1.0`

[Get started](#get-started) · [CSV input guide](docs/INPUTS.md) · [Upgrade roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)

</div>

---

Explore prepared USB activity records in a **browser-based triage workspace**. Review the timeline, compare device identifiers, and find repeated connection records worth investigating. The app is static and works with GitHub Pages; it has no server-side component, analytics, or account requirement.

| Workspace | What it shows |
| --- | --- |
| **Overview** | Record counts, connection records, device IDs, repeated IDs, and an activity chart. |
| **Evidence explorer** | Searchable, filterable timeline and paginated device summaries. |
| **Data quality** | Source SHA-256, skipped rows, missing identifiers, and timezone assumptions. |
| **Exports** | Filtered events as spreadsheet-safe CSV and a plain-text triage report. |

Evidence is processed in the browser tab; files are not uploaded or saved automatically. Source files remain unchanged by the application. Exports are downloaded only when requested. Use a separate destination so browser download settings do not overwrite your original evidence.

## Get started

### Open the browser app

After GitHub Pages is enabled for this repository, open the published site link shown in **Settings → Pages**. Select **Try fictional sample**, or choose a prepared CSV and select **Analyze records**. Before analysis, set the fixed UTC offset for timestamps without one; the default is `+00:00`.

To run a local copy, download or clone this repository and open `index.html` in a current browser. If your browser does not permit SHA-256 hashing on local files, serve the folder through localhost instead:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`. Python is only needed for this optional local server, not for the browser app on GitHub Pages. The browser version needs a secure context (HTTPS, localhost, or a supported local-file context) for its SHA-256 API. Once the page assets are loaded, evidence analysis requires no network access.

### CSV requirements

Use a UTF-8 CSV containing these columns:

```csv
timestamp,event_type,device_id,computer,username
2026-01-12T08:12:00Z,connected,USB-DEMO-001,LAB-PC-01,analyst
```

The first three columns are required; `computer` and `username` are optional. The limit is **one CSV, 20 MiB, and 100,000 data records** per analysis. The built-in sample is fictional and includes one invalid timestamp and one missing ID for data-quality review. See the [input guide](docs/INPUTS.md) for supported timestamp and event formats, examples, and export details.

### Desktop version

The original v1.0 Python/Tkinter desktop app remains in this repository. To run it on Windows, macOS, or Linux, install Python 3.10–3.12 with Tkinter, then:

```bash
python -m venv .venv
```

Activate the environment using `.\.venv\Scripts\Activate.ps1` in Windows PowerShell or `source .venv/bin/activate` on macOS/Linux, then run:

```bash
python -m pip install -r requirements.txt
python app.py
```

## Evidence and limitations

> **A triage aid, not an authorization detector.** Repeated device IDs or connection-labelled records are leads for review, not proof of an unauthorized device, physical insertion, file transfer, or compromise.

- This version reads **prepared CSV** only. It does **not** directly parse `.evtx`, Windows Event Viewer exports, registry hives, SetupAPI logs, or live devices.
- Event meanings depend on how the source was prepared. Records can be incomplete, duplicated, spoofed, or incorrectly classified upstream. Duplicates are retained; empty IDs are excluded from device counts; IDs are grouped case-insensitively across hosts.
- Offset-free timestamps use your selected **fixed** offset. That does not model daylight-saving changes. Displayed times are UTC, and CSV exports retain the original timestamp text.
- A SHA-256 fingerprint helps compare copies; it does not establish provenance or chain of custody. Preserve originals and validate findings against independent evidence.

## Development and tests

The browser app uses plain HTML, CSS, and JavaScript with no build step or runtime dependencies. Run its automated tests with Node.js:

```bash
node --test tests/browser-analysis.test.cjs
```

The original desktop tests can be run after installing the Python requirements:

```bash
python -m unittest discover -s tests -v
```

The [numbered roadmap](docs/ROADMAP.md) lists proposed upgrades in order of importance. None should be assumed to exist until implemented and tested.

---

<div align="center">Created by <strong>Namitesh Pandey</strong> · Cybersecurity learning & portfolio project</div>
