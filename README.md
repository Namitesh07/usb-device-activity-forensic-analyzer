<div align="center">

<img src="assets/banner.svg" width="760" alt="USB Activity Forensic Analyzer">

# USB Device Activity Forensic Analyzer

**Explore prepared USB activity records locally in your browser.**

[![Browser-local analysis](assets/badge-local.svg)](docs/INPUTS.md#outputs-and-preservation)
[![Prepared CSV input](assets/badge-csv.svg)](docs/INPUTS.md#prepared-csv-contract)
[![Version 1.1.0](assets/badge-version.svg)](CHANGELOG.md)

[**Open the live app ↗**](https://namitesh07.github.io/usb-device-activity-forensic-analyzer/) · [Input guide](docs/INPUTS.md) · [Setup & tests](docs/SETUP.md) · [Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)

</div>

## At a glance

- **Investigate:** Search a timeline and review device IDs and repeated connection records.
- **Check context:** Inspect skipped rows, timezone assumptions, and a source SHA-256 fingerprint.
- **Export:** Download filtered events as CSV or a text triage report. Files are processed in your browser and are not uploaded.

## Try it

1. [Open the app](https://namitesh07.github.io/usb-device-activity-forensic-analyzer/) and choose **Try fictional sample** or select a [prepared CSV](docs/INPUTS.md#prepared-csv-contract).
2. Set the fixed UTC offset for timestamps without one, then analyze and explore the results.

> **Limits:** The tool reads prepared CSVs; it does not directly parse `.evtx`, Windows Event Viewer exports, registry hives, or live devices. Repeated records are leads for review, not proof of unauthorized use. [Read the evidence guide →](docs/INPUTS.md)

The original Python desktop app remains available. See [setup and testing](docs/SETUP.md) and the [upgrade roadmap](docs/ROADMAP.md).

---

<div align="center">Created by <strong>Namitesh Pandey</strong></div>
