# Upgrade roadmap

This is a proposed, dependency-ordered backlog, not a claim that the listed features already exist. Validate each release with representative fixtures and document its limits. Versions and scope can change as the project develops.

The v1.3.0 browser release adds the first Phase 2 evidence adapters and conservative correlation locally on the user's device. Broader event mappings and raw registry-hive parsing remain future work.

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

## Phase 3 — Analyst workflow

9. **Device drill-down:** show full ID, all related records, hosts, source references, and a timeline; allow host-specific grouping to avoid merging unrelated devices.
10. **Timeline and filters:** add date/time ranges, host/user/device filters, sorting, and views that make the selected time zone explicit.
11. **Analyst notes and tags:** attach observations to a case, source, record, or device with edit history and clearly separate notes from evidence.
12. **Known-device comparison:** import a local allowlist and show `matched`, `no match`, or `insufficient identifier`. A no-match result must not be labelled unauthorized without independent verification.
13. **Explainable review rules:** add configurable patterns such as repeated records, new-to-dataset identifiers, and activity outside analyst-specified hours; show supporting evidence and benign explanations.
14. **Expanded reporting:** create a printable HTML/PDF report with selected findings, filters, source hashes, timezone decisions, analyst notes, data-quality warnings, and limitations.

## Phase 4 — Cases and reproducibility

15. **Optional local cases:** save and reopen cases explicitly, for example through a versioned user-managed case file in the browser; the desktop app could optionally use SQLite. Avoid silently persisting sensitive logs.
16. **Evidence provenance and custody:** record collection details supplied by the analyst, source fingerprints, import decisions, and actions in an append-only audit view; explain what this can and cannot prove.
17. **Reproducible exports:** provide a versioned case manifest and machine-readable JSON with filters, rule settings, hashes, and original-record references.
18. **Safer handling of case files:** document browser-managed downloads and original-file preservation, add desktop path checks where applicable, and provide retention/deletion guidance; evaluate encryption only with an established design and honest key-management limits.

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

**Recommended next phase:** improve analyst workflow while expanding the validated fixture corpus and Windows source coverage.
