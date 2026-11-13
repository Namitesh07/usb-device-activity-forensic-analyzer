/* Prepared USB activity CSV analysis. No browser or network APIs are required. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.USBAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_RECORDS = 100000;
  const REQUIRED = ['timestamp', 'event_type', 'device_id'];

  function parseOffset(value) {
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(String(value).trim());
    if (!match || Number(match[2]) > 23 || Number(match[3]) > 59) {
      throw new Error('Use a fixed UTC offset between -23:59 and +23:59, such as +05:30.');
    }
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
  }

  // Unlike Date.parse(), this validates every calendar component and preserves
  // up to six fractional digits instead of silently discarding microseconds.
  function parseTimestamp(value, assumedOffset) {
    const text = String(value).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?([Zz]|[+-]\d{2}:\d{2})?$/.exec(text);
    if (!m) throw new Error('invalid ISO date and time (maximum six fractional digits)');
    const [year, month, day, hour, minute, second] = m.slice(1, 7).map((v, i) => i === 5 && v === undefined ? 0 : Number(v));
    if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
      throw new Error('invalid ISO date and time');
    }
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    d.setUTCHours(hour, minute, second, 0);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      throw new Error('invalid calendar date');
    }
    const offset = !m[8] ? assumedOffset : /^[Zz]$/.test(m[8]) ? 0 : parseOffset(m[8]);
    const fraction = (m[7] || '').padEnd(6, '0');
    const micros = Number(fraction || 0);
    const ms = d.getTime() - offset * 60000 + Math.floor(micros / 1000);
    const utc = new Date(ms);
    if (utc.getUTCFullYear() < 1 || utc.getUTCFullYear() > 9999) {
      throw new Error('timestamp is outside the supported UTC date range');
    }
    const base = utc.toISOString().slice(0, 19);
    return { utc: base + (micros ? '.' + String(micros).padStart(6, '0') : '') + 'Z', ms, microRemainder: micros % 1000, naive: !m[8] };
  }

  // Strict, RFC-style parsing preserves quoted commas, quotes, and newlines.
  // Record numbers are logical CSV records, not physical line numbers.
  function parseCSV(text, options) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false, started = false;
    function finishField() {
      if (options && options.maxFields && row.length >= options.maxFields) throw new Error('A CSV record exceeds the 512-value safety limit.');
      row.push(field); field = ''; closed = false; started = false;
    }
    function finishRow() {
      if (row.length || field !== '' || started || closed) {
        finishField(); rows.push(row);
        if (rows.length > MAX_RECORDS + 1) throw new Error('CSV exceeds the 100,000-record input limit.');
      }
      row = []; field = ''; closed = false; started = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closed = true; }
        } else field += c;
      } else if (closed) {
        if (c === ',') finishField();
        else if (c === '\n' || c === '\r') { finishRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
        else throw new Error('Malformed CSV: unexpected character after a closing quote.');
      } else if (c === ',' ) {
        finishField();
      } else if (c === '\n' || c === '\r') {
        finishRow(); if (c === '\r' && text[i + 1] === '\n') i++;
      } else if (c === '"') {
        if (started || field) throw new Error('Malformed CSV: unexpected quote in an unquoted field.');
        quoted = true; started = true;
      } else {
        field += c; started = true;
      }
    }
    if (quoted) throw new Error('Malformed CSV: a quoted field was not closed.');
    finishRow();
    return rows;
  }

  function normalizeType(value) {
    const key = String(value).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    if (['connected', 'connect', 'connection', 'device connected', 'plugged in', 'inserted'].includes(key)) return 'connected';
    if (['disconnected', 'disconnect', 'disconnection', 'device disconnected', 'unplugged', 'removed'].includes(key)) return 'disconnected';
    return 'other';
  }

  function parsePreparedCSV(text, offsetText) {
    const assumedOffset = parseOffset(offsetText);
    const rows = parseCSV(String(text).replace(/^\uFEFF/, ''));
    if (!rows.length) throw new Error('The CSV is empty or has no header row.');
    const headers = rows.shift().map(h => h.trim().toLowerCase());
    if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Column names must be nonempty and unique, ignoring case.');
    const missing = REQUIRED.filter(h => !headers.includes(h));
    if (missing.length) throw new Error('Missing required columns: ' + missing.join(', ') + '.');
    const at = Object.fromEntries(headers.map((h, i) => [h, i]));
    const events = [], issues = [];
    let naiveTimestamps = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], recordNumber = i + 2;
      if (row.length > headers.length) { issues.push(`Record ${recordNumber}: more values than headers.`); continue; }
      const get = name => String(row[at[name]] ?? '').trim();
      const originalTimestamp = get('timestamp');
      let time;
      try { time = parseTimestamp(originalTimestamp, assumedOffset); }
      catch (error) { issues.push(`Record ${recordNumber}: ${error.message}.`); continue; }
      if (time.naive) naiveTimestamps++;
      const originalEventType = get('event_type');
      events.push({ timestamp: time.utc, ms: time.ms, microRemainder: time.microRemainder,
        originalTimestamp, eventType: normalizeType(originalEventType), originalEventType,
        deviceId: get('device_id'), computer: get('computer'), username: get('username'), recordNumber });
    }
    events.sort((a, b) => a.ms - b.ms || a.microRemainder - b.microRemainder || a.recordNumber - b.recordNumber);
    return { events, issues, totalRecords: rows.length, naiveTimestamps, assumedOffset: String(offsetText).trim() };
  }

  async function loadBytes(input, filename, offsetText) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > MAX_BYTES) throw new Error('CSV exceeds the 20 MiB input limit.');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { throw new Error('CSV must be valid UTF-8 (a UTF-8 BOM is allowed).'); }
    const parsed = parsePreparedCSV(text, offsetText);
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('SHA-256 needs a secure browser context. Open this app on HTTPS or localhost.');
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
    return { ...parsed, filename: String(filename), sha256 };
  }

  function filterEvents(events, query, type) {
    const needle = String(query || '').trim().toLowerCase();
    return events.filter(e => (!type || type === 'all' || e.eventType === type) &&
      (!needle || [e.deviceId, e.computer, e.username, e.originalEventType, e.originalTimestamp].join(' ').toLowerCase().includes(needle)));
  }

  function summarize(events) {
    const types = { connected: 0, disconnected: 0, other: 0 }, daily = new Map(), devices = new Map();
    let missingIds = 0;
    for (const e of events) {
      types[e.eventType]++;
      const day = e.timestamp.slice(0, 10);
      daily.set(day, (daily.get(day) || 0) + 1);
      const key = e.deviceId.trim().toLowerCase();
      if (!key) { missingIds++; continue; }
      if (!devices.has(key)) devices.set(key, { deviceId: e.deviceId, records: 0, connections: 0, firstSeen: e.timestamp, lastSeen: e.timestamp, computers: new Set() });
      const item = devices.get(key);
      item.records++; if (e.eventType === 'connected') item.connections++;
      item.lastSeen = e.timestamp;
      if (e.computer) item.computers.add(e.computer.toLowerCase());
    }
    const list = [...devices.values()].map(d => ({ ...d, computers: d.computers.size }));
    list.sort((a, b) => b.connections - a.connections || b.records - a.records || a.deviceId.localeCompare(b.deviceId));
    return { records: events.length, connections: types.connected, devices: list,
      repeated: list.filter(d => d.connections >= 2).length, missingIds, types, daily: [...daily.entries()] };
  }

  function spreadsheetSafe(value) {
    const text = String(value ?? '');
    return /^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text) ? "'" + text : text;
  }
  function quoteCSV(value) { return '"' + spreadsheetSafe(value).replace(/"/g, '""') + '"'; }
  function exportCSV(data, events) {
    const headers = ['timestamp_utc', 'timestamp_original', 'event_type', 'event_type_original', 'device_id', 'computer', 'username', 'source_record', 'source_file', 'source_sha256'];
    const rows = events.map(e => [e.timestamp, e.originalTimestamp, e.eventType, e.originalEventType, e.deviceId, e.computer, e.username, e.recordNumber, data.filename, data.sha256]);
    return '\uFEFF' + [headers, ...rows].map(row => row.map(quoteCSV).join(',')).join('\r\n') + '\r\n';
  }
  function reportText(data, events, query, type) {
    const s = summarize(events);
    const lines = ['USB DEVICE ACTIVITY FORENSIC ANALYZER — TRIAGE REPORT', '='.repeat(54),
      'Generated (UTC): ' + new Date().toISOString(), 'Source file: ' + data.filename,
      'Source SHA-256: ' + data.sha256, `Source CSV records: ${data.totalRecords}`,
      `Valid records: ${data.events.length} | Skipped: ${data.issues.length}`,
      `Timestamps without an offset: ${data.naiveTimestamps} | Assumed fixed offset: ${data.assumedOffset}`,
      `Filters — search: ${query || '(none)'} | event type: ${type || 'all'}`, '', 'FILTERED RESULTS',
      `Records: ${s.records}`, `Connection records: ${s.connections}`, `Distinct nonempty device IDs: ${s.devices.length}`,
      `IDs with at least two connection records: ${s.repeated}`, `Records missing device ID: ${s.missingIds}`, '', 'DEVICE SUMMARY (UTC)'];
    if (!s.devices.length) lines.push('No nonempty device IDs in the current view.');
    s.devices.forEach(d => lines.push(`- ${d.deviceId} | connections: ${d.connections} | records: ${d.records} | first: ${d.firstSeen} | last: ${d.lastSeen} | named computers: ${d.computers}`));
    lines.push('', 'IMPORT ISSUES (first 20)', ...(data.issues.slice(0, 20).length ? data.issues.slice(0, 20) : ['None.']));
    if (data.issues.length > 20) lines.push(`... and ${data.issues.length - 20} more.`);
    lines.push('', 'INTERPRETATION AND LIMITATIONS', 'Counts describe CSV records, not verified physical connections; duplicates are retained.',
      'Repeated connection records are a review lead, not proof of unauthorized use.',
      'Device identifiers may be missing, reused, spoofed, or changed; confirm independently.',
      'Fixed offsets do not model daylight-saving changes. Preserve original evidence.');
    return lines.join('\n') + '\n';
  }
  return { MAX_BYTES, MAX_RECORDS, parseOffset, parseTimestamp, parseCSV, normalizeType, parsePreparedCSV, loadBytes,
    filterEvents, summarize, spreadsheetSafe, exportCSV, reportText };
});
