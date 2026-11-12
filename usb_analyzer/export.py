"""Explicit, local exports. CSV string values are protected for spreadsheet use."""

from __future__ import annotations

import csv
import os
from datetime import datetime, timezone
from pathlib import Path

from .analysis import Event, LoadedData, format_utc, summarize


def spreadsheet_safe(value: object) -> str:
    text = str(value)
    # Spreadsheet applications may ignore whitespace before interpreting formulas.
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def check_destination(path: str | Path, data: LoadedData) -> None:
    target = Path(path)
    if target.resolve() == data.source_path or (target.exists() and data.source_path.exists() and os.path.samefile(target, data.source_path)):
        raise ValueError("Choose a different file; the original source must not be overwritten.")


def write_csv(path: str | Path, data: LoadedData, events: list[Event]) -> None:
    check_destination(path, data)
    headers = ["timestamp_utc", "timestamp_original", "event_type", "event_type_original",
               "device_id", "computer", "username", "source_record", "source_file", "source_sha256"]
    with open(path, "w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(headers)
        for event in events:
            row = [format_utc(event.timestamp), event.original_timestamp, event.event_type,
                   event.original_event_type, event.device_id, event.computer, event.username,
                   event.record_number, data.filename, data.sha256]
            writer.writerow([spreadsheet_safe(value) for value in row])


def report_text(data: LoadedData, events: list[Event], query: str, event_type: str) -> str:
    stats = summarize(events)
    now = format_utc(datetime.now(timezone.utc))
    lines = [
        "USB DEVICE ACTIVITY FORENSIC ANALYZER — TRIAGE REPORT",
        "=" * 58,
        f"Generated (UTC): {now}",
        f"Source file: {data.filename}",
        f"Source SHA-256: {data.sha256}",
        f"Source CSV records: {data.total_records}",
        f"Valid records: {len(data.events)} | Skipped: {len(data.issues)}",
        f"Naive timestamps: {data.naive_timestamps}; assumed fixed offset: {data.assumed_offset}",
        f"Filter — search: {query or '(none)'} | event type: {event_type}",
        "",
        "FILTERED RESULTS",
        f"Records: {stats['records']}",
        f"Connection records: {stats['connections']}",
        f"Distinct nonempty device IDs: {len(stats['devices'])}",
        f"IDs with at least two connection records: {stats['repeated']}",
        f"Records missing device ID: {stats['missing_ids']}",
        "",
        "DEVICE SUMMARY (UTC)",
    ]
    if not stats["devices"]:
        lines.append("No nonempty device IDs in the current view.")
    for device in stats["devices"]:
        lines.append(f"- {device['device_id']} | connections: {device['connections']} | "
                     f"records: {device['records']} | first: {format_utc(device['first_seen'])} | "
                     f"last: {format_utc(device['last_seen'])} | named computers: {device['computers']}")
    lines.extend(["", "IMPORT ISSUES (first 20)"])
    lines.extend(data.issues[:20] or ["None."])
    if len(data.issues) > 20:
        lines.append(f"... and {len(data.issues) - 20} more.")
    lines.extend([
        "", "INTERPRETATION AND LIMITATIONS",
        "Counts describe CSV records, not verified physical connections; duplicates are retained.",
        "An ID with multiple connection records is a review lead, not proof of unauthorized use.",
        "Device identifiers may be missing, reused, spoofed, or changed; confirm independently.",
        "Coverage, clocks, fixed timezone assumptions and source interpretation affect results.",
        "Preserve the original file and validate findings against authoritative evidence.",
    ])
    return "\n".join(lines) + "\n"


def write_report(path: str | Path, data: LoadedData, events: list[Event], query: str, event_type: str) -> None:
    check_destination(path, data)
    Path(path).write_text(report_text(data, events, query, event_type), encoding="utf-8")
