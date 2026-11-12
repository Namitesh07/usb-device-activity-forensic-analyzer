# Changelog

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
