# Upgrade roadmap

This is a proposed, dependency-ordered backlog, not a claim that the listed features already exist. Validate each release with representative fixtures and document its limits. Versions and scope can change as the project develops.

The v1.2.0 browser release completes the Phase 1 prepared-CSV improvements locally on the user's device. Later phases remain future work.

## Phase 1 — More dependable input (completed in v1.2.0)

1. **Import preview and column mapping:** review suggested or manual mappings and sample rows for each source, then confirm prepared event meanings. Original fields and mappings remain with the in-memory case and exports.
2. **Richer data-quality review:** page through every quality entry, including skipped rows, unknown labels, missing identifiers, and duplicate candidates; export the complete quality list.
3. **Timezone handling:** use fixed offsets or IANA zones and review ambiguous or nonexistent local times. Original values, supported precision, and analyst decisions are retained. IANA interpretation of offset-free times covers 1970–2100.
4. **Multiple input files:** combine up to 20 prepared CSVs with separate fingerprints and provenance; duplicate candidates are visible and all records are retained.

## Phase 2 — Evidence adapters

5. **Windows Event Viewer CSV/XML import:** create provider-and-channel-aware adapters, map fields conservatively, and test against documented fixtures. Explain what each mapped event does and does not establish.
6. **Direct EVTX reading:** optionally parse local `.evtx` copies, document the parser dependency, handle errors and large files, and keep event record IDs, channel, provider, and source hash.
7. **Offline Windows artifact support:** investigate tested parsing for relevant SetupAPI logs and registry artifacts such as USBSTOR. Distinguish installation, enumeration, and other artifacts from verified connection times.
8. **Source correlation:** link records by host, identifier, and time while showing why they were associated and preserving uncertainty, conflicts, and provenance.

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

**Recommended next phase:** start with upgrade 5, using carefully validated provider-and-channel-specific Windows Event Viewer export mappings before adding more complex evidence sources.
