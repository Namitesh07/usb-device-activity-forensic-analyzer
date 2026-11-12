# Upgrade roadmap

This is a proposed, dependency-ordered backlog, not a claim that the listed features already exist. Validate each release with representative fixtures and document its limits. Versions and scope can change as the project develops.

## v1.1 — More dependable input

1. **Import preview and column mapping:** map common prepared CSV headers, preview sample rows, and require confirmation of event meanings. Keep the original values and mapping with the case.
2. **Richer data-quality review:** inspect every rejected row, unknown event label, missing identifier, and duplicated record; offer a separate error export without altering evidence.
3. **Timezone handling:** accept IANA time zones, surface ambiguous/nonexistent daylight-saving times for analyst resolution, and preserve timestamp precision and original offsets.
4. **Multiple input files:** combine authorized CSVs with per-file fingerprints, separate provenance, size limits, and visible duplicate candidates; retain originals.

## v1.2 — Evidence adapters

5. **Windows Event Viewer CSV/XML import:** create provider-and-channel-aware adapters, map fields conservatively, and test against documented fixtures. Explain what each mapped event does and does not establish.
6. **Direct EVTX reading:** optionally parse local `.evtx` copies, document the parser dependency, handle errors and large files, and keep event record IDs, channel, provider, and source hash.
7. **Offline Windows artifact support:** investigate tested parsing for relevant SetupAPI logs and registry artifacts such as USBSTOR. Distinguish installation, enumeration, and other artifacts from verified connection times.
8. **Source correlation:** link records by host, identifier, and time while showing why they were associated and preserving uncertainty, conflicts, and provenance.

## v1.3 — Analyst workflow

9. **Device drill-down:** show full ID, all related records, hosts, source references, and a timeline; allow host-specific grouping to avoid merging unrelated devices.
10. **Timeline and filters:** add date/time ranges, host/user/device filters, sorting, and views that make the selected time zone explicit.
11. **Analyst notes and tags:** attach observations to a case, source, record, or device with edit history and clearly separate notes from evidence.
12. **Known-device comparison:** import a local allowlist and show `matched`, `no match`, or `insufficient identifier`. A no-match result must not be labelled unauthorized without independent verification.
13. **Explainable review rules:** add configurable patterns such as repeated records, new-to-dataset identifiers, and activity outside analyst-specified hours; show supporting evidence and benign explanations.
14. **Expanded reporting:** create a printable HTML/PDF report with selected findings, filters, source hashes, timezone decisions, analyst notes, data-quality warnings, and limitations.

## v1.4 — Cases and reproducibility

15. **Optional SQLite cases:** save and reopen cases locally with schema migrations, explicit save/delete controls, and clear storage locations; avoid silently persisting sensitive logs.
16. **Evidence provenance and custody:** record collection details supplied by the analyst, source fingerprints, import decisions, and actions in an append-only audit view; explain what this can and cannot prove.
17. **Reproducible exports:** provide a versioned case manifest and machine-readable JSON with filters, rule settings, hashes, and original-record references.
18. **Safer handling of case files:** add input/output path checks, permissions guidance, and a documented retention/deletion workflow; evaluate encryption only with an established design and honest key-management limits.

## v1.5 — Reliability and presentation

19. **Realistic test corpus:** add licensed or synthetic Windows fixtures, malformed files, mixed timezones, large datasets, regression tests, and parser cross-checks.
20. **Automated checks:** run tests and static checks in CI across supported operating systems and Python versions; scan dependencies and document update policy.
21. **Performance and accessibility:** background imports, progress/cancel controls, virtualized tables, keyboard navigation, improved contrast, and screen-reader checks.
22. **Packaging and onboarding:** build signed, reproducible releases where feasible, add platform installation instructions, sample walkthroughs, screenshots, and troubleshooting.

## Later, if justified by evidence and testing

23. **Additional operating systems:** investigate Linux and macOS artifact adapters with separate documented meanings and representative fixtures.
24. **Live collection:** only as an explicit opt-in feature with clear privileges, collection scope, provenance, performance impact, and a review of privacy and security implications.
25. **Removable-media enrichment:** optional offline vendor/product lookup and device metadata, with versioned reference data and clear limits on identity confidence.
26. **Advanced correlation:** link evidence from multiple hosts or a broader investigation only when identity and clock assumptions can be shown and tested.

**Recommended next release:** upgrades 1–4. They make the current CSV workflow more reliable before adding complex Windows evidence sources or persistent case storage.
