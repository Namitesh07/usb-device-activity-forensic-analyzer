# Input and evidence guide

## Prepared CSV contract

Use a UTF-8 CSV with a header row. Header names are case-insensitive and surrounding spaces are ignored. The following columns must exist, even when a particular device ID is unknown:

| Column | Meaning |
| --- | --- |
| `timestamp` | ISO date **and time**, such as `2026-01-15T09:30:00Z` or `2026-01-15 15:00:00+05:30`. |
| `event_type` | A prepared description of the activity, such as `connected` or `disconnected`. |
| `device_id` | Source device identifier; blank if unavailable. |
| `computer` | Optional host name. |
| `username` | Optional user name, only if available in the evidence. |

Extra columns are ignored. Quote fields according to normal CSV rules if they contain commas, quotes, or newlines. A UTF-8 BOM is accepted. Inputs are limited to **20 MiB** and **100,000 data records**. Too-large, malformed, or unsupported files are rejected with an error. Rows with invalid/missing timestamps or extra values are skipped and listed in Data quality; the original stays untouched. Duplicate records are deliberately retained.

Accepted event descriptions, ignoring case and differences in spaces, hyphens, or underscores:

| Normalized event | Accepted values |
| --- | --- |
| `connected` | `connected`, `connect`, `connection`, `device connected`, `plugged in`, `inserted` |
| `disconnected` | `disconnected`, `disconnect`, `disconnection`, `device disconnected`, `unplugged`, `removed` |
| `other` | Every other value, including blank values. |

Do not label an event as a connection unless the meaning of that source event justifies it. For example, a driver installation or device discovery record does not automatically establish a physical insertion at that timestamp. The app does not infer meanings from Windows event IDs.

## Time and identity

Times with `Z` or an explicit `±HH:MM` offset are normalized to UTC. For timestamps without an offset, enter the source's known **fixed** offset before importing. `+00:00` is the default assumption and may be wrong for your data. If the source spans a daylight-saving change, prepare timestamps with explicit offsets first. Up to six fractional-second digits are supported; higher precision is rejected rather than silently rounded. Invalid timestamps are skipped.

Device IDs are grouped after removing surrounding spaces and ignoring case. IDs with no value are not counted as devices. This grouping may combine identical IDs appearing on different hosts; it cannot establish that two records refer to the same physical item. A repeated ID means **at least two rows labelled connected** after filtering. Duplicates can inflate this count.

## Preparing Windows evidence

v1.0 **cannot directly parse** `.evtx`, Event Viewer CSV/XML exports, registry hives, SetupAPI logs, or live hardware. Acquire and preserve the original records using an appropriate, authorized process. Separately prepare a CSV with the columns above, retaining the original evidence and documenting how event meanings, host names, users, and timestamps were derived. Windows event channels, providers, and event IDs have different meanings; validate any mapping against that specific source before converting it. Direct import adapters are planned for later phases.

## Outputs and preservation

The filtered CSV contains UTC and original timestamp text, normalized and original event type, device ID, computer, user, logical CSV record number, source filename, and original-file SHA-256. A record number counts the CSV header as record 1; it is not necessarily a physical line number. CSV fields that could be interpreted as spreadsheet formulas receive a leading apostrophe, so the export may differ from the original value. The text report describes the filtered view, source fingerprint, import issues, and limits. The app prevents selecting the loaded source file as an export destination.

The fingerprint verifies a byte-for-byte comparison only. It does not establish who collected a file, when it was collected, or whether its contents are truthful. Retain originals and document custody and interpretation separately.
