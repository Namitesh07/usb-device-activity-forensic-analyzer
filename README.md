<div align="center">

<img src="assets/banner.svg" width="760" alt="USB Activity Forensic Analyzer">

# USB Device Activity Forensic Analyzer

**Explore USB-related Windows evidence locally in your browser.**

[![Browser-local analysis](assets/badge-local.svg)](docs/INPUTS.md#outputs-and-preservation)
[![Prepared CSV input](assets/badge-csv.svg)](docs/INPUTS.md#prepared-csv-contract)
[![Version 1.3.0](assets/badge-version.svg)](https://github.com/Namitesh07/usb-device-activity-forensic-analyzer/releases)

[**Open the live app ↗**](https://namitesh07.github.io/usb-device-activity-forensic-analyzer/) · [Input guide](docs/INPUTS.md) · [Setup & tests](docs/SETUP.md) · [Roadmap](docs/ROADMAP.md) · [Releases](https://github.com/Namitesh07/usb-device-activity-forensic-analyzer/releases)

</div>

## At a glance

- **Investigate:** Review prepared CSVs and selected Windows event, SetupAPI, and USBSTOR exports.
- **Check context:** Review source fingerprints, data-quality issues, and possible cross-source associations.
- **Export:** Download events, quality findings, associations, registry keys, or a text report. Evidence stays in your browser.

## Try it

1. [Open the app](https://namitesh07.github.io/usb-device-activity-forensic-analyzer/) and choose **Try Windows evidence demo** or select [supported files](docs/INPUTS.md#windows-evidence-adapters).
2. Review source context and time settings, confirm the preview, then analyze the records.

> **Limits:** Only selected Windows event meanings and SetupAPI/USBSTOR export formats are supported; raw registry hives and live devices are not. Recognition and installation records do not prove physical insertion or unauthorized use. [Read the evidence guide →](docs/INPUTS.md)

The original Python desktop app remains available. See [setup and testing](docs/SETUP.md) and the [upgrade roadmap](docs/ROADMAP.md).

---

<div align="center">Created by <strong>Namitesh Pandey</strong></div>

