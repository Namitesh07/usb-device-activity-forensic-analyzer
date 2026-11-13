# Changelog

## v1.2.0 — Phase 1: more dependable input

- Preview up to 20 prepared CSV files and review per-source column mappings, event meanings, time settings, and SHA-256 fingerprints before analysis.
- Review all data-quality entries, including skipped records, unknown labels, missing IDs, and duplicate candidates; export the full quality list separately.
- Interpret offset-free timestamps using a fixed offset or IANA time zone. Ambiguous and nonexistent local times remain skipped until an analyst resolves them.
- Retain original field values, mappings, source references, and analyst timestamp decisions in the in-memory case and relevant CSV exports.
- Added a fictional two-file demo and regression tests for mapping, timezones, data quality, provenance, limits, and spreadsheet-safe exports.
- IANA interpretation of offset-free times is limited to years 1970–2100 and uses the browser's time-zone database. Direct Windows artifact parsing remains future work.

## v1.1.0 — Browser-based workspace

- Added a static, browser-local application suitable for GitHub Pages, with no backend, sign-in, or runtime dependencies.
- Added prepared CSV import, a built-in fictional sample, an activity chart, timeline and device summaries, search, filters, and paginated evidence views.
- Added source SHA-256, explicit timezone assumptions, data-quality information, and filtered CSV and text-report exports.
- Added JavaScript tests covering sample counts, timestamp precision, malformed inputs, limits, provenance, and spreadsheet-safe exports.
- Retained the original v1.0 Python desktop app and its tests.

## v1.0.0 — Initial release

- Local Tkinter workspace for a single prepared USB activity CSV, with a fictional sample.
- Timeline and device summaries, daily activity and top-device charts, search and event filters.
- SHA-256 source fingerprint, timestamp conversion, skipped-row feedback, and data-quality notes.
- Export filtered records as spreadsheet-safe CSV or a plain-text triage report.
- Unit tests and documentation outlining supported inputs, limits, and planned upgrades.
