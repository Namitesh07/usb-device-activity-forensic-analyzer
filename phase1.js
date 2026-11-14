/* Multi-source prepared CSV intake and evidence review. Everything runs locally. */
(function (root, factory) {
  const analysis = typeof module === 'object' && module.exports ? require('./analysis.js') : root.USBAnalysis;
  const api = factory(analysis);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.USBPhase1 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (A) {
  'use strict';

  const MAX_FILES = 20, MAX_BYTES = A.MAX_BYTES, MAX_RECORDS = A.MAX_RECORDS, MAX_COLUMNS = 256;
  const FIELDS = ['timestamp', 'event_type', 'device_id', 'computer', 'username'];
  const REQUIRED = ['timestamp', 'event_type', 'device_id'];
  const ALIASES = {
    timestamp: ['timestamp', 'date_time', 'datetime', 'event_time', 'event_timestamp', 'time_created', 'timecreated', 'time'],
    event_type: ['event_type', 'eventtype', 'activity_type', 'activity', 'action', 'event'],
    device_id: ['device_id', 'deviceid', 'device_identifier', 'usb_id', 'serial_number', 'serial'],
    computer: ['computer', 'computer_name', 'hostname', 'host', 'machine', 'machine_name'],
    username: ['username', 'user_name', 'user', 'account']
  };
  const formatterCache = new Map(), offsetCache = new Map();

  function headerKey(value) { return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  function suggestMapping(headers) {
    const keys = headers.map(headerKey), mapping = {};
    for (const field of FIELDS) {
      const matches = keys.map((key, i) => ALIASES[field].includes(key) ? i : -1).filter(i => i >= 0);
      mapping[field] = matches.length === 1 ? matches[0] : null;
    }
    return mapping;
  }
  async function readInputBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input && input.bytes instanceof Uint8Array) return input.bytes;
    if (input && typeof input.arrayBuffer === 'function') return new Uint8Array(await input.arrayBuffer());
    throw new Error('Could not read the selected CSV file.');
  }
  async function prepareSource(input, filename, id) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > MAX_BYTES) throw new Error('A CSV exceeds the 20 MiB combined input limit.');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { throw new Error(`${filename}: CSV must be valid UTF-8 (a BOM is allowed).`); }
    let rows;
    try { rows = A.parseCSV(text.replace(/^\uFEFF/, ''), { maxFields: 512 }); }
    catch (error) { throw new Error(`${filename}: ${error.message}`); }
    if (!rows.length) throw new Error(`${filename}: CSV is empty or has no header row.`);
    const headers = rows.shift();
    if (headers.length > MAX_COLUMNS) throw new Error(`${filename}: CSV has more than 256 columns.`);
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('SHA-256 needs a secure browser context. Open the app on HTTPS or localhost.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    return { id: String(id), filename: String(filename), size: bytes.byteLength, sha256, headers, rows, suggestedMapping: suggestMapping(headers) };
  }
  function validateCollection(sources) {
    if (!Array.isArray(sources) || !sources.length) throw new Error('Choose at least one evidence file.');
    if (sources.length > MAX_FILES) throw new Error('Choose no more than 20 files at once.');
    if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error('Source identifiers must be unique.');
    if (sources.reduce((sum, s) => sum + s.size, 0) > MAX_BYTES) throw new Error('Combined file size exceeds 20 MiB.');
    if (sources.reduce((sum, s) => sum + s.rows.length + (s.artifacts || []).length, 0) > MAX_RECORDS) throw new Error('Combined sources exceed the 100,000-record input limit.');
  }
  function validateMapping(source, mapping) {
    if (!mapping || typeof mapping !== 'object') throw new Error(`${source.filename}: choose the column mappings.`);
    const used = new Set();
    for (const field of FIELDS) {
      const index = mapping[field];
      if (index === null || index === undefined || index === '') {
        if (REQUIRED.includes(field)) throw new Error(`${source.filename}: map the ${field} column.`);
        continue;
      }
      if (!Number.isInteger(index) || index < 0 || index >= source.headers.length) throw new Error(`${source.filename}: invalid ${field} column.`);
      if (used.has(index)) throw new Error(`${source.filename}: each mapped field must use a different column.`);
      used.add(index);
    }
  }
  function zoneFormatter(zone) {
    if (formatterCache.has(zone)) return formatterCache.get(zone);
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB-u-ca-iso8601-nu-latn', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
      fmt.format(new Date(0));
    } catch (_) { throw new Error(`Unknown IANA time zone: ${zone}. Use a name such as Asia/Kolkata or America/New_York.`); }
    formatterCache.set(zone, fmt);
    return fmt;
  }
  function validateZone(zone) {
    if (!zone || !['fixed', 'iana'].includes(zone.mode)) throw new Error('Choose a fixed UTC offset or an IANA time zone.');
    const value = String(zone.value || '').trim();
    if (zone.mode === 'fixed') A.parseOffset(value);
    else {
      if (!value || !/^(?:UTC|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+)$/.test(value)) throw new Error('Use an IANA time zone such as Asia/Kolkata or America/New_York.');
      zoneFormatter(value);
    }
    return { mode: zone.mode, value };
  }
  function partsAsUTC(ms, formatter) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }
  // Cache offsets observed around each local day. Every returned candidate is
  // round-tripped through Intl; no nonexistent wall time is silently shifted.
  function offsetsNearDay(zone, wallMs) {
    const day = Math.floor(wallMs / 86400000) * 86400000, key = `${zone}|${day}`;
    if (offsetCache.has(key)) return offsetCache.get(key);
    const fmt = zoneFormatter(zone), offsets = new Set();
    for (let delta = -48; delta <= 72; delta += 6) {
      const at = day + delta * 3600000;
      offsets.add((partsAsUTC(at, fmt) - at) / 1000);
    }
    const result = [...offsets];
    if (offsetCache.size >= 4096) offsetCache.delete(offsetCache.keys().next().value);
    offsetCache.set(key, result);
    return result;
  }
  function utcString(ms, microRemainder, nanoRemainder, precision) {
    const d = new Date(ms), fraction = d.getUTCMilliseconds() * 1000000 + microRemainder * 1000 + (nanoRemainder || 0);
    return d.toISOString().slice(0, 19) + (fraction ? '.' + String(fraction).padStart(9, '0').slice(0, precision || 6) : '') + 'Z';
  }
  function offsetString(seconds) {
    const sign = seconds < 0 ? '-' : '+', n = Math.abs(seconds);
    const hours = Math.floor(n / 3600), minutes = Math.floor(n % 3600 / 60), secs = n % 60;
    return sign + String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + (secs ? ':' + String(secs).padStart(2, '0') : '');
  }
  function ianaCandidates(wall, zone) {
    const year = new Date(wall.ms).getUTCFullYear();
    if (year < 1970 || year > 2100) throw new Error('IANA-zone interpretation supports years 1970–2100; supply an explicit offset for other years.');
    const fmt = zoneFormatter(zone), roundedWall = Math.floor(wall.ms / 1000) * 1000;
    const matches = [];
    for (const seconds of offsetsNearDay(zone, wall.ms)) {
      const ms = wall.ms - seconds * 1000;
      if (partsAsUTC(ms, fmt) === roundedWall) matches.push({ ms, microRemainder: wall.microRemainder, nanoRemainder: wall.nanoRemainder, precision: wall.precision, utc: utcString(ms, wall.microRemainder, wall.nanoRemainder, wall.precision), offset: offsetString(seconds) });
    }
    return matches.sort((a, b) => a.ms - b.ms).filter((x, i, all) => i === 0 || x.ms !== all[i - 1].ms);
  }
  function interpretTimestamp(rawValue, zone, resolution) {
    const raw = String(rawValue).trim();
    let wall;
    try { wall = A.parseTimestamp(raw, zone.mode === 'fixed' ? A.parseOffset(zone.value) : 0); }
    catch (error) { return { state: 'invalid', message: error.message }; }
    if (!wall.naive) return { state: 'ok', time: wall, basis: 'source offset', resolvedInput: '', candidates: [] };
    if (zone.mode === 'fixed') return { state: 'ok', time: wall, basis: `fixed offset ${zone.value}`, resolvedInput: '', candidates: [] };
    let candidates;
    try { candidates = ianaCandidates(wall, zone.value); }
    catch (error) { return { state: 'invalid', message: error.message }; }
    if (candidates.length === 1) return { state: 'ok', time: candidates[0], basis: `IANA ${zone.value} (${candidates[0].offset})`, resolvedInput: '', candidates };
    const kind = candidates.length ? 'ambiguous_time' : 'nonexistent_time';
    if (resolution && resolution.type === 'candidate' && candidates.length > 1) {
      const selected = candidates.find(c => c.utc === resolution.utc);
      if (!selected) throw new Error('The selected UTC candidate is no longer valid. Review the timestamp again.');
      return { state: 'resolved', kind, time: selected, basis: `analyst-selected IANA ${zone.value} (${selected.offset})`, resolvedInput: selected.utc, candidates };
    }
    if (resolution && resolution.type === 'override' && !candidates.length) {
      let chosen;
      try { chosen = A.parseTimestamp(String(resolution.value), 0); }
      catch (_) { throw new Error('Enter a valid replacement ISO date and time with Z or an explicit ±HH:MM offset.'); }
      if (chosen.naive) throw new Error('The analyst-supplied replacement must include Z or an explicit ±HH:MM offset.');
      return { state: 'resolved', kind, time: chosen, basis: 'analyst-supplied timestamp; independently verify', resolvedInput: String(resolution.value).trim(), candidates };
    }
    return { state: 'unresolved', kind, candidates, message: candidates.length ? 'Local time occurs more than once in this time zone; choose a supported UTC candidate.' : 'Local time does not exist in this time zone; supply a verified replacement timestamp with an explicit offset or leave it skipped.' };
  }
  function mappingInfo(source, mapping) {
    return Object.fromEntries(FIELDS.map(field => {
      const index = mapping[field];
      return [field, Number.isInteger(index) ? { column: index + 1, header: source.headers[index] } : null];
    }));
  }
  function analyzeSources(sources, configs, resolutions) {
    validateCollection(sources);
    const currentResolutions = resolutions || {}, info = [], events = [], issues = [], seen = new Map();
    let skipped = 0, naiveTimestamps = 0, duplicateCandidates = 0, unresolvedTimes = 0;
    for (const source of sources) {
      const config = configs[source.id];
      if (!config) throw new Error(`${source.filename}: review the import settings.`);
      validateMapping(source, config.mapping);
      const zone = validateZone(config.zone), mapping = { ...config.mapping }, mappingDescription = mappingInfo(source, mapping);
      const meta = { id: source.id, filename: source.filename, size: source.size, sha256: source.sha256, headers: source.headers,
        format: source.format || 'Prepared CSV', context: source.context || {}, artifactCount: (source.artifacts || []).length,
        mapping: mappingDescription, zone, totalRecords: source.rows.length, accepted: 0, skipped: 0, naiveTimestamps: 0 };
      info.push(meta);
      const rawField = (row, name) => Number.isInteger(mapping[name]) ? String(row[mapping[name]] ?? '') : '';
      source.rows.forEach((row, index) => {
        const recordNumber = index + 2, recordKey = `${source.id}:${recordNumber}`;
        const fields = Object.fromEntries(FIELDS.map(name => [name, rawField(row, name)]));
        const base = { source: meta, recordNumber, recordKey, originalHeaders: source.headers, originalValues: row, fields };
        function issue(code, message, extra) { issues.push({ ...base, code, message, ...(extra || {}) }); }
        const explicitOffset = /(?:[Zz]|[+-]\d{2}:\d{2})$/.test(fields.timestamp.trim());
        const duplicateKey = JSON.stringify([fields.timestamp, fields.event_type, fields.device_id, fields.computer, fields.username, explicitOffset ? 'source-offset' : zone]);
        const first = seen.get(duplicateKey);
        if (first) { duplicateCandidates++; issue('duplicate_candidate', `Mapped fields match ${first.sourceId}, record ${first.recordNumber}. Other fields may differ; this is not proof of a duplicate.`, { duplicateOf: first }); }
        else seen.set(duplicateKey, { sourceId: source.id, filename: source.filename, recordNumber });
        const type = A.normalizeType(fields.event_type);
        if (type === 'other' && !source.adapter) issue('unknown_event_type', 'Event label is unrecognized or blank; retained as other when its timestamp is usable.');
        if (!fields.device_id.trim()) issue('missing_device_id', 'Device ID is missing; the record cannot contribute to device counts.');
        if (row.length > source.headers.length) {
          skipped++; meta.skipped++; issue('extra_values', 'More field values than headers; this record is excluded.'); return;
        }
        const result = interpretTimestamp(fields.timestamp, zone, currentResolutions[recordKey]);
        if (result.state === 'invalid') { skipped++; meta.skipped++; issue('invalid_timestamp', result.message); return; }
        if (result.state === 'unresolved') {
          skipped++; meta.skipped++; unresolvedTimes++;
          issue(result.kind, result.message, { candidates: result.candidates, resolved: false }); return;
        }
        if (result.state === 'resolved') issue(result.kind, 'Analyst supplied an explicit timestamp decision; preserve the original and independently verify it.', { candidates: result.candidates, resolved: true, chosen: result.resolvedInput });
        if (!explicitOffset) { naiveTimestamps++; meta.naiveTimestamps++; }
        meta.accepted++;
        const time = result.time;
        events.push({ timestamp: time.utc, ms: time.ms, microRemainder: time.microRemainder, nanoRemainder: time.nanoRemainder,
          originalTimestamp: fields.timestamp, eventType: type, originalEventType: fields.event_type,
          deviceId: fields.device_id.trim(), computer: fields.computer.trim(), username: fields.username.trim(),
          recordNumber, recordKey, source: meta, originalHeaders: source.headers, originalValues: row,
          timeBasis: result.basis, resolvedInput: result.resolvedInput, duplicateOf: first || null });
      });
    }
    events.sort((a, b) => a.ms - b.ms || a.microRemainder - b.microRemainder || (a.nanoRemainder || 0) - (b.nanoRemainder || 0) || a.source.id.localeCompare(b.source.id) || a.recordNumber - b.recordNumber);
    return { sources: info, events, issues, totalRecords: sources.reduce((sum, s) => sum + s.rows.length, 0), skipped,
      naiveTimestamps, duplicateCandidates, unresolvedTimes };
  }
  function filterEvents(events, query, type) {
    const needle = String(query || '').trim().toLowerCase();
    return events.filter(e => (!type || type === 'all' || e.eventType === type) &&
      (!needle || [e.deviceId, e.computer, e.username, e.originalEventType, e.originalTimestamp, e.source.filename, e.source.id].join(' ').toLowerCase().includes(needle)));
  }
  function csvCell(value) { return '"' + A.spreadsheetSafe(value).replace(/"/g, '""') + '"'; }
  function csvChunks(headers, records, makeRow) {
    const chunks = ['\uFEFF' + headers.map(csvCell).join(',') + '\r\n'];
    let lines = [];
    for (const record of records) {
      lines.push(makeRow(record).map(csvCell).join(','));
      if (lines.length === 500) { chunks.push(lines.join('\r\n') + '\r\n'); lines = []; }
    }
    if (lines.length) chunks.push(lines.join('\r\n') + '\r\n');
    return chunks;
  }
  function exportEventsCSVChunks(data, events) {
    const headers = ['timestamp_utc','timestamp_original','timestamp_basis','analyst_timestamp_decision','event_type','event_type_original','device_id','computer','username','source_id','source_file','source_sha256','source_record','source_timezone','source_format','analyst_supplied_context_json','source_column_mapping_json','original_headers_json','original_values_json','duplicate_candidate_of'];
    return csvChunks(headers, events, e => [e.timestamp,e.originalTimestamp,e.timeBasis,e.resolvedInput,e.eventType,e.originalEventType,e.deviceId,e.computer,e.username,e.source.id,e.source.filename,e.source.sha256,e.recordNumber,`${e.source.zone.mode}: ${e.source.zone.value}`,e.source.format,JSON.stringify(e.source.context),JSON.stringify(e.source.mapping),JSON.stringify(e.originalHeaders),JSON.stringify(e.originalValues),e.duplicateOf ? `${e.duplicateOf.sourceId}:${e.duplicateOf.recordNumber}` : '']);
  }
  function exportIssuesCSVChunks(data) {
    const headers = ['issue_type','message','resolution_status','selected_timestamp','source_id','source_file','source_sha256','source_record','source_timezone','source_format','analyst_supplied_context_json','source_column_mapping_json','original_headers_json','original_values_json','candidate_times_json'];
    return csvChunks(headers, data.issues, i => [i.code,i.message,i.resolved === true ? 'resolved' : i.resolved === false ? 'unresolved' : '',i.chosen || '',i.source.id,i.source.filename,i.source.sha256,i.recordNumber,`${i.source.zone.mode}: ${i.source.zone.value}`,i.source.format,JSON.stringify(i.source.context),JSON.stringify(i.source.mapping),JSON.stringify(i.originalHeaders),JSON.stringify(i.originalValues),JSON.stringify(i.candidates || [])]);
  }
  function exportEventsCSV(data, events) { return exportEventsCSVChunks(data, events).join(''); }
  function exportIssuesCSV(data) { return exportIssuesCSVChunks(data).join(''); }
  function reportText(data, events, query, type) {
    const stats = A.summarize(events), counts = {};
    data.issues.forEach(i => { counts[i.code] = (counts[i.code] || 0) + 1; });
    const lines = ['USB DEVICE ACTIVITY FORENSIC ANALYZER — TRIAGE REPORT', '='.repeat(54), 'Generated (UTC): ' + new Date().toISOString(),
      `Source files: ${data.sources.length} | Source records: ${data.totalRecords} | Accepted: ${data.events.length} | Skipped: ${data.skipped}`,
      `Quality entries: ${data.issues.length} | Unresolved local times: ${data.unresolvedTimes} | Duplicate candidates: ${data.duplicateCandidates}`,
      `Filters — search: ${query || '(none)'} | event type: ${type || 'all'}`, '', 'SOURCE FILES AND IMPORT DECISIONS'];
    data.sources.forEach(s => lines.push(`- ${s.id}: ${s.filename} | SHA-256: ${s.sha256} | format: ${s.format} | records: ${s.totalRecords} | registry keys: ${s.artifactCount} | accepted: ${s.accepted} | skipped: ${s.skipped} | timezone: ${s.zone.mode} ${s.zone.value} | analyst context: ${JSON.stringify(s.context)} | mapping: ${JSON.stringify(s.mapping)}`));
    lines.push('', 'FILTERED RESULTS', `Records: ${stats.records}`, `Connection records: ${stats.connections}`, `Distinct nonempty device IDs: ${stats.devices.length}`,
      `IDs with at least two connection records: ${stats.repeated}`, `Records missing device ID: ${stats.missingIds}`, '', 'DEVICE SUMMARY (UTC)');
    if (!stats.devices.length) lines.push('No nonempty device IDs in the current view.');
    stats.devices.forEach(d => lines.push(`- ${d.deviceId} | connections: ${d.connections} | records: ${d.records} | first: ${d.firstSeen} | last: ${d.lastSeen} | named computers: ${d.computers}`));
    lines.push('', 'DATA QUALITY (dataset-wide)', ...Object.entries(counts).map(([k,v]) => `${k}: ${v}`));
    if (!data.issues.length) lines.push('No quality entries.');
    data.issues.slice(0, 20).forEach(i => lines.push(`- ${i.source.id} record ${i.recordNumber}: ${i.code} — ${i.message}${i.chosen ? ' Decision: ' + i.chosen : ''}`));
    if (data.issues.length > 20) lines.push(`... and ${data.issues.length - 20} more entries; use the quality CSV for all entries.`);
    lines.push('', 'INTERPRETATION AND LIMITATIONS', 'Counts describe source records, not verified physical connections; all duplicate candidates are retained.',
      'Matching mapped fields can describe distinct events. Repeated records are leads, not proof of unauthorized use.',
      'IANA results use the browser time-zone database. Analyst timestamp decisions are not source evidence.',
      'Preserve original files and validate collection, timestamps, event meanings, and findings independently.');
    return lines.join('\n') + '\n';
  }
  return { MAX_FILES, MAX_BYTES, MAX_RECORDS, MAX_COLUMNS, FIELDS, REQUIRED, suggestMapping, readInputBytes, prepareSource, validateCollection,
    validateMapping, validateZone, interpretTimestamp, analyzeSources, filterEvents, exportEventsCSV, exportIssuesCSV,
    exportEventsCSVChunks, exportIssuesCSVChunks, reportText };
});
