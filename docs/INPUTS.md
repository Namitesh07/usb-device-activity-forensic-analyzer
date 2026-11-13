# Input and evidence guide

## Prepared CSV contract

The browser app accepts **prepared UTF-8 CSVs**. Choose up to 20 files at once, with a combined limit of **20 MiB and 100,000 data records**. Each file may have up to 256 header columns and each record may contain at most 512 values. A UTF-8 BOM is accepted. Analysis and exports run in the browser tab and hold data in memory; large inputs and exports can use substantial memory and briefly pause the interface.

Each source needs columns representing:

| Field | Meaning |
| --- | --- |
| Timestamp | ISO date and time, such as `2026-01-15T09:30:00Z` or `2026-01-15 15:00:00+05:30`. |
| Prepared event label | A source-supported description such as `connected` or `disconnected`. |
| Device ID | Source identifier; an individual value can be blank. |
| Computer | Optional host name. |
| User | Optional user name. |

For example:

```csv
timestamp,event_type,device_id,computer,username
2026-01-12T08:12:00Z,connected,USB-DEMO-001,LAB-PC-01,analyst
```

The app previews the first five records of each file and suggests mappings for some common headers. **Review every suggestion.** If multiple columns could match a field, select the correct one. Blank or duplicate header names can be distinguished by column number; one source column cannot be mapped to multiple fields. Optional fields may be left unmapped.

You must confirm that event labels were prepared from evidence. Windows event IDs are **not** automatically interpreted. A driver installation or device discovery record does not necessarily prove physical insertion. Original headers, values, and mappings are retained in the in-memory case and relevant exports; a preview may shorten long displayed text.

Quote fields that contain commas, quotes, or newlines according to CSV rules. Invalid UTF-8, malformed quoting, excessive size or field count, and missing headers reject the **entire selection**; a previously analyzed case stays available. Individual records with an invalid timestamp or more values than headers are skipped and listed in Data quality. Duplicate records are not removed.

## Event labels and data quality

Labels are normalized ignoring case and differences in spaces, hyphens, or underscores:

| Normalized event | Accepted values |
| --- | --- |
| `connected` | `connected`, `connect`, `connection`, `device connected`, `plugged in`, `inserted` |
| `disconnected` | `disconnected`, `disconnect`, `disconnection`, `device disconnected`, `unplugged`, `removed` |
| `other` | Every other value, including blank labels. |

Open **Data quality** after analysis to page through all entries. They include skipped records, unrecognized labels, missing IDs, duplicate candidates, and ambiguous or nonexistent local times. One record may have multiple entries. Original fields can be expanded in the review and event tables.

A **duplicate candidate** has exactly matching mapped source values for timestamp, event label, device ID, computer, and user; offset-free records must also use the same selected time setting. Unmapped columns are ignored, so matching fields can still represent different events. Candidates are flagged, not removed or verified. Duplicate rows can inflate connection and repeated-ID counts.

## Time and identity

The browser app accepts `YYYY-MM-DDTHH:MM[:SS[.ffffff]][Z|±HH:MM]`. A space may replace `T`; a comma may replace the fraction's period. Up to six fractional-second digits are retained; greater precision and invalid calendar times are rejected. Explicit source offsets take precedence over the selected source setting.

For timestamps without an offset, set **each source's** time context before confirming the import:

- **Fixed offset:** Enter a value such as `+05:30`. The default is `+00:00` and may be wrong for your evidence. Fixed offsets do not model daylight-saving changes.
- **IANA time zone:** Enter a name such as `America/New_York` or `Asia/Kolkata`. Interpretation of offset-free values is supported for years **1970–2100**. For other years, use a source timestamp with an explicit offset or a fixed-offset setting.

When a local time occurs twice, the record is skipped until an analyst chooses one of the displayed UTC candidates. When a local time does not exist, the record stays skipped unless an analyst supplies a separately verified replacement ISO timestamp containing `Z` or an explicit offset. The original value remains visible, and the analyst's choice is labelled as a decision rather than source evidence. Decisions can be cleared.

IANA interpretation uses the browser's time-zone database and searches offsets around the source date, then round-trips candidates. Browser databases can differ, and very short-lived historical offset changes may need an explicit source offset. Validate important timestamps against independent evidence.

Device IDs are grouped after trimming surrounding spaces and ignoring case, including across hosts. Blank IDs do not contribute to device counts. Grouping cannot establish that records refer to the same physical item. An ID is “repeated” in the current view when at least two rows are labelled connected.

## Preparing Windows evidence

The browser and desktop apps **cannot directly parse** raw `.evtx` files, Windows Event Viewer CSV/XML exports, registry hives, SetupAPI logs, or live hardware. Acquire and preserve original records using an appropriate, authorized process. Separately prepare CSVs and document how event meanings, identities, hosts, and timestamps were derived. Validate mappings against the specific source and provider before labelling activity.

## Outputs and preservation

- **Events CSV:** all records matching the current filters, with UTC and original timestamps, event values, source ID, filename, SHA-256, logical record number, time setting, column mapping, original headers and values, duplicate-candidate references, and any analyst timestamp decision.
- **Quality CSV:** all dataset-wide quality entries, including skipped and accepted records with warnings, source references, original headers and values, mappings, and any time candidates or decisions.
- **Text report:** source summaries and mappings, current filters and device counts, quality counts and the first 20 quality entries, and interpretation limits.

Logical record numbers count the header as record 1 and are not necessarily physical line numbers. CSV cells that could be interpreted as spreadsheet formulas receive a leading apostrophe, so exported representations may differ from source values. Browser-managed downloads cannot guarantee source-path protection: choose a different name and location and never overwrite original evidence.

The current case remains in memory until the tab is refreshed, closed, or cleared. Exports do not reopen a case. Retain the original files and document collection separately; a SHA-256 fingerprint supports byte comparison but does not establish authenticity or chain of custody.

## Original desktop app

The included v1.0 desktop app remains a separate, single-file workflow. It requires the original `timestamp`, `event_type`, and `device_id` headers and uses a fixed offset for offset-free timestamps. The browser-only Phase 1 mapping, IANA review, multiple-file handling, and full quality export do not change the desktop app.
