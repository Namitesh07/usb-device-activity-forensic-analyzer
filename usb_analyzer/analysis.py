"""Parse and summarize prepared USB event records without modifying the source."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

MAX_BYTES = 20 * 1024 * 1024
MAX_RECORDS = 100_000
REQUIRED_COLUMNS = {"timestamp", "event_type", "device_id"}
_ISO_WITH_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")
_OFFSET = re.compile(r"^([+-])(\d{2}):(\d{2})$")


class InputError(ValueError):
    """Input does not satisfy the documented CSV contract."""


@dataclass(frozen=True)
class Event:
    timestamp: datetime
    original_timestamp: str
    event_type: str
    original_event_type: str
    device_id: str
    computer: str
    username: str
    record_number: int


@dataclass(frozen=True)
class LoadedData:
    filename: str
    source_path: Path
    sha256: str
    total_records: int
    events: list[Event]
    issues: list[str]
    naive_timestamps: int
    assumed_offset: str


def parse_offset(value: str) -> timezone:
    """Parse a fixed offset; daylight-saving rules must be resolved upstream."""
    value = value.strip()
    match = _OFFSET.fullmatch(value)
    if not match:
        raise InputError("Use a UTC offset like +00:00 or +05:30.")
    sign, hour, minute = match.groups()
    hours, minutes = int(hour), int(minute)
    if hours > 23 or minutes > 59:
        raise InputError("UTC offset must be between -23:59 and +23:59.")
    delta = timedelta(hours=hours, minutes=minutes)
    return timezone(delta if sign == "+" else -delta)


def parse_timestamp(value: str, assumed_tz: timezone) -> tuple[datetime, bool]:
    value = value.strip()
    if not _ISO_WITH_TIME.match(value):
        raise ValueError("expected an ISO date and time, e.g. 2026-01-15T09:30:00Z")
    fraction = re.search(r"\d{2}:\d{2}:\d{2}[.,](\d+)", value)
    if fraction and len(fraction.group(1)) > 6:
        raise ValueError("timestamp precision exceeds six fractional digits")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith(("Z", "z")) else value)
    except ValueError as exc:
        raise ValueError("invalid ISO timestamp") from exc
    is_naive = parsed.tzinfo is None or parsed.utcoffset() is None
    if is_naive:
        parsed = parsed.replace(tzinfo=assumed_tz)
    try:
        return parsed.astimezone(timezone.utc), is_naive
    except OverflowError as exc:
        raise ValueError("timestamp is outside the supported UTC date range") from exc


def normalize_event_type(value: str) -> str:
    key = re.sub(r"[\s_-]+", " ", value.strip().casefold())
    if key in {"connected", "connect", "connection", "device connected", "plugged in", "inserted"}:
        return "connected"
    if key in {"disconnected", "disconnect", "disconnection", "device disconnected", "unplugged", "removed"}:
        return "disconnected"
    return "other"


def device_key(value: str) -> str:
    return value.strip().casefold()


def load_csv(path: str | Path, offset: str = "+00:00") -> LoadedData:
    assumed_tz = parse_offset(offset)
    file_path = Path(path)
    try:
        with file_path.open("rb") as file:
            raw = file.read(MAX_BYTES + 1)
    except OSError as exc:
        raise InputError(f"Could not open the CSV: {exc}") from exc
    if len(raw) > MAX_BYTES:
        raise InputError("CSV exceeds the 20 MiB input limit.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise InputError("CSV must be UTF-8 encoded (a UTF-8 BOM is allowed).") from exc

    reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
    try:
        original_headers = reader.fieldnames
        if not original_headers:
            raise InputError("The CSV is empty or has no header row.")
        headers = [str(h).strip().casefold() for h in original_headers]
        if any(not h for h in headers) or len(set(headers)) != len(headers):
            raise InputError("Column names must be nonempty and unique (ignoring case).")
        missing = REQUIRED_COLUMNS - set(headers)
        if missing:
            raise InputError("Missing required columns: " + ", ".join(sorted(missing)))
        reader.fieldnames = headers
        events: list[Event] = []
        issues: list[str] = []
        total = 0
        naive_count = 0
        for record in reader:
            total += 1
            if total > MAX_RECORDS:
                raise InputError(f"CSV exceeds the {MAX_RECORDS:,}-record input limit.")
            number = total + 1  # Logical CSV record, counting the header as record 1.
            if None in record:
                issues.append(f"Record {number}: more values than headers")
                continue
            raw_time = (record.get("timestamp") or "").strip()
            try:
                timestamp, is_naive = parse_timestamp(raw_time, assumed_tz)
            except ValueError as exc:
                issues.append(f"Record {number}: {exc}")
                continue
            raw_type = (record.get("event_type") or "").strip()
            events.append(Event(
                timestamp=timestamp,
                original_timestamp=raw_time,
                event_type=normalize_event_type(raw_type),
                original_event_type=raw_type,
                device_id=(record.get("device_id") or "").strip(),
                computer=(record.get("computer") or "").strip(),
                username=(record.get("username") or "").strip(),
                record_number=number,
            ))
            naive_count += int(is_naive)
    except csv.Error as exc:
        raise InputError(f"Malformed CSV near line {reader.line_num}: {exc}") from exc

    events.sort(key=lambda e: (e.timestamp, e.record_number))
    return LoadedData(file_path.name, file_path.resolve(), hashlib.sha256(raw).hexdigest(), total, events, issues, naive_count, offset.strip())


def filter_events(events: list[Event], query: str = "", event_type: str = "all") -> list[Event]:
    query = query.strip().casefold()
    return [event for event in events
            if (event_type == "all" or event.event_type == event_type)
            and (not query or query in " ".join((event.device_id, event.computer, event.username,
                                                event.original_event_type, event.original_timestamp)).casefold())]


def summarize(events: list[Event]) -> dict:
    counts = Counter(event.event_type for event in events)
    if not events:
        return {"records": 0, "connections": 0, "devices": [], "repeated": 0,
                "daily": [], "counts": counts, "missing_ids": 0}

    frame = pd.DataFrame([{
        "device_key": device_key(e.device_id), "device_id": e.device_id,
        "timestamp": e.timestamp, "connected": int(e.event_type == "connected"),
        "computer": e.computer,
    } for e in events])
    # Python dates avoid pandas' narrower nanosecond timestamp range for unusual evidence.
    daily_frame = frame.assign(day=[e.timestamp.date().isoformat() for e in events])
    daily = [(str(day), int(count)) for day, count in daily_frame.groupby("day").size().items()]
    known = frame[frame["device_key"] != ""]
    devices = []
    for _, group in known.groupby("device_key", sort=False):
        first_seen, last_seen = group["timestamp"].min(), group["timestamp"].max()
        devices.append({
            "device_id": str(group.iloc[0]["device_id"]),
            "records": len(group),
            "connections": int(group["connected"].sum()),
            "first_seen": first_seen.to_pydatetime() if hasattr(first_seen, "to_pydatetime") else first_seen,
            "last_seen": last_seen.to_pydatetime() if hasattr(last_seen, "to_pydatetime") else last_seen,
            "computers": len({c.casefold() for c in group["computer"] if c}),
        })
    devices.sort(key=lambda d: (-d["connections"], -d["records"], d["device_id"].casefold()))
    return {"records": len(events), "connections": counts["connected"], "devices": devices,
            "repeated": sum(d["connections"] >= 2 for d in devices), "daily": daily,
            "counts": counts, "missing_ids": int((frame["device_key"] == "").sum())}


def format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
