# Upgrade roadmap

This is a proposed, dependency-ordered backlog, not a claim that the listed features already exist. Validate each release with representative fixtures and document its limits. Versions and scope can change as the project develops.

The v1.6.0 browser release adds user-managed cases, source verification, analyst-recorded provenance, and machine-readable manifests. Broader event mappings and raw registry-hive parsing remain future work.

## Phase 1 — More dependable input (completed in v1.2.0)

1. **Import preview and column mapping:** review suggested or manual mappings and sample rows for each source, then confirm prepared event meanings. Original fields and mappings remain with the in-memory case and exports.
2. **Richer data-quality review:** page through every quality entry, including skipped rows, unknown labels, missing identifiers, and duplicate candidates; export the complete quality list.
3. **Timezone handling:** use fixed offsets or IANA zones and review ambiguous or nonexistent local times. Original values, supported precision, and analyst decisions are retained. IANA interpretation of offset-free times covers 1970–2100.
4. **Multiple input files:** combine up to 20 prepared CSVs with separate fingerprints and provenance; duplicate candidates are visible and all records are retained.

## Phase 2 — Evidence adapters (first implementation in v1.3.0)

5. **Windows Event Viewer CSV/XML:** implemented conservative metadata extraction and one documented provider/channel/ID mapping: Security event 6416. Other events are retained as unmapped. Localized dates and additional mappings need further work.
6. **Direct EVTX reading:** bundled a locally executed WebAssembly parser with chunk error checks, source hash, event IDs, record IDs, provider and channel. Broader real-world fixtures and independent validation remain important.
7. **Offline Windows artifacts:** added selected SetupAPI device-install sections and text `.reg` exports of USBSTOR instance keys. Raw registry hives and other device artifact families remain unsupported.
8. **Source correlation:** reports same-host/full-ID records within five minutes, untimed registry identity links, and IDs seen on different hosts, with explanations and capped output. More advanced correlation needs further validation.

## Phase 3 — Analyst workflow (completed in v1.5.0)

9. **Device drill-down (v1.4.0):** explore accepted records and untimed registry keys by host and ID, or explicitly group across hosts; source references and fingerprints remain visible.
10. **Timeline and filters (v1.4.0):** filter by UTC time range, host, user, device and type; sort by time and choose UTC or an IANA display zone.
11. **Analyst notes and tags (v1.4.0):** attach in-memory observations to a case, source, record, or device; keep edit history and export it separately from evidence.
12. **Known-device comparison (v1.5.0):** compare a local CSV by device ID and optional host, showing `matched`, `no match`, or `insufficient identifier`. A no-match result is not proof of unauthorized use.
13. **Explainable review rules (v1.5.0):** review duplicate candidates, first identifiers in the current view, and records outside analyst-specified hours, with supporting records and benign explanations.
14. **Expanded reporting (v1.5.0):** export printable HTML with selected findings, filters, source hashes, timezone decisions, analyst notes, quality warnings, and limits; use the browser to print or save as PDF.

## Phase 4 — Cases and reproducibility (browser implementation in v1.6.0)

15. **Optional local cases:** save a versioned JSON case and reopen it by selecting the original sources, which must match the recorded SHA-256 hashes. The browser does not silently persist cases; the original desktop app remains separate.
16. **Evidence provenance and custody:** record analyst-supplied collection details, source fingerprints, import decisions, and selected actions in a chronological view. Entries append in the app, but editable files and local clocks do not prove custody or resist tampering.
17. **Reproducible exports:** export a versioned JSON manifest with filters, rule settings, source hashes, timestamp decisions, baseline snapshot, notes, audit entries, and original-record references.
18. **Safer handling of case files:** document browser-managed downloads, original-file preservation, storage and deletion; the desktop exporter already checks the source path and same-file aliases. Case files are not encrypted.

## Phase 5 — Reliability and presentation

19. **Realistic test corpus:** add licensed or synthetic Windows fixtures, malformed files, mixed timezones, large datasets, regression tests, and parser cross-checks.
20. **Automated checks:** run browser-engine and JavaScript tests, plus desktop tests across supported operating systems and Python versions; scan dependencies and document update policy.
21. **Performance and accessibility:** background imports, progress/cancel controls, virtualized tables, keyboard navigation, improved contrast, and screen-reader checks.
22. **Packaging and onboarding:** improve the browser demo and offline download, add sample walkthroughs, screenshots, and troubleshooting; provide signed desktop releases where feasible.

## Later, if justified by evidence and testing

23. **Additional operating systems:** investigate Linux and macOS artifact adapters with separate documented meanings and representative fixtures.
24. **Live collection:** investigate a separate, explicit opt-in companion only if justified; browsers cannot silently inspect operating-system USB history. Document privileges, collection scope, provenance, and privacy implications.
25. **Removable-media enrichment:** optional offline vendor/product lookup and device metadata, with versioned reference data and clear limits on identity confidence.
26. **Advanced correlation:** link evidence from multiple hosts or a broader investigation only when identity and clock assumptions can be shown and tested.

**Recommended next phase:** improve the fixture corpus, automated checks, accessibility, and performance.
