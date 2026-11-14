/* Windows evidence adapters and conservative source correlation, entirely local. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./analysis.js') : root.USBAnalysis;
  const P = typeof module === 'object' && module.exports ? require('./phase1.js') : root.USBPhase1;
  const api = factory(A, P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.USBPhase2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (A, P) {
  'use strict';
  const HEADERS = ['timestamp', 'event_type', 'device_id', 'computer', 'username', 'provider', 'channel', 'event_id', 'event_record_id', 'interpretation', 'source_record'];
  const MAPPING = { timestamp: 0, event_type: 1, device_id: 2, computer: 3, username: 4 };
  const MAX_MATCHES = 500, WINDOW_MS = 5 * 60 * 1000;
  const recognized = 'External device recognized';
  const explanation = 'Security 6416 records external device recognition or enablement; it does not by itself prove a physical insertion, file access, or that the device is USB.';
  const unknown = 'Unmapped Windows event';
  const unknownExplanation = 'No automatic USB or connection meaning assigned for this provider, channel, and event ID.';
  const installation = 'Device installation section';
  const installExplanation = 'SetupAPI records a device installation operation; the section start is not a verified physical connection time.';
  const key = s => String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const val = v => v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean' ? String(v) : '';
  function objectify(value) {
    if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), objectify(v)]));
    if (Array.isArray(value)) return value.map(objectify);
    if (typeof value === 'bigint') return String(value);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, objectify(v)]));
    return value == null ? null : value;
  }
  function field(obj, name) {
    if (!obj || typeof obj !== 'object') return '';
    const found = Object.keys(obj).filter(k => key(k) === key(name));
    return found.length === 1 ? val(obj[found[0]]) : '';
  }
  function decode(bytes, filename, allowUtf16) {
    try {
      let encoding = 'utf-8';
      if (allowUtf16 && bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
      else if (allowUtf16 && bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
      return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    } catch (_) { throw new Error(filename + ': invalid text encoding. Use UTF-8 or a UTF-16 file with a BOM.'); }
  }
  async function hash(bytes) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('SHA-256 needs HTTPS or localhost.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  }
  function uniqueColumn(headers, aliases) {
    const indices = headers.map((h, i) => aliases.includes(key(h)) ? i : -1).filter(i => i >= 0);
    return indices.length === 1 ? indices[0] : -1;
  }
  function isWindowsCSV(headers) {
    return uniqueColumn(headers, ['eventid']) >= 0 && uniqueColumn(headers, ['provider','providername','source']) >= 0 && uniqueColumn(headers, ['datetime','dateandtime','timecreated','systemtime','timestamp']) >= 0;
  }
  function parseWindowsCSV(text) {
    const rows = A.parseCSV(text.replace(/^\uFEFF/, ''), { maxFields: 512 });
    if (!rows.length) throw new Error('The Windows Event CSV has no header.');
    const headers = rows.shift();
    if (headers.length > P.MAX_COLUMNS) throw new Error('CSV has more than 256 columns.');
    if (!isWindowsCSV(headers)) throw new Error('This CSV is missing an unambiguous time, event ID, or provider/source column.');
    const cols = {
      timestamp: uniqueColumn(headers, ['datetime','dateandtime','timecreated','systemtime','timestamp']),
      provider: uniqueColumn(headers, ['provider','providername','source']), channel: uniqueColumn(headers, ['channel','logname']),
      eventId: uniqueColumn(headers, ['eventid']), recordId: uniqueColumn(headers, ['eventrecordid','recordid','recordnumber']),
      computer: uniqueColumn(headers, ['computer','computername']), username: uniqueColumn(headers, ['subjectusername']),
      deviceId: uniqueColumn(headers, ['deviceid','deviceinstanceid','deviceinstancepath'])
    };
    const get = (row, fieldName) => cols[fieldName] < 0 ? '' : String(row[cols[fieldName]] || '');
    return rows.map((row, i) => {
      if (row.length > headers.length) throw new Error('Windows Event CSV record ' + (i + 2) + ' has more values than headers.');
      return { type:'windows', timestamp:get(row,'timestamp'), provider:get(row,'provider'), channel:get(row,'channel'), eventId:get(row,'eventId'), recordId:get(row,'recordId'), computer:get(row,'computer'), username:get(row,'username'), deviceId:get(row,'deviceId'), original:JSON.stringify({ headers, values:row, csv_record:i+2 }) };
    });
  }
  const direct = (node, name) => node ? Array.from(node.children || []).find(child => child.localName === name) : null;
  function readXmlEvent(event, serializer) {
    const system = direct(event, 'System');
    if (!system) throw new Error('An Event element is missing its System element.');
    const provider = direct(system, 'Provider'), time = direct(system, 'TimeCreated');
    const data = direct(event, 'EventData'), fields = {};
    if (data) for (const node of Array.from(data.children || [])) {
      if (node.localName !== 'Data') continue;
      const name = node.getAttribute('Name');
      if (name) fields[name] = Object.prototype.hasOwnProperty.call(fields, name) ? null : node.textContent;
    }
    return { type:'windows', timestamp:time?.getAttribute('SystemTime') || '', provider:provider?.getAttribute('Name') || '', channel:direct(system,'Channel')?.textContent || '', eventId:direct(system,'EventID')?.textContent || '', recordId:direct(system,'EventRecordID')?.textContent || '', computer:direct(system,'Computer')?.textContent || '', username:field(fields,'SubjectUserName'), deviceId:field(fields,'DeviceId'), original:serializer.serializeToString(event) };
  }
  function parseWindowsXML(text, Parser, Serializer) {
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('XML document type declarations and entities are not supported.');
    if (!Parser || !Serializer) throw new Error('This browser cannot parse XML.');
    const doc = new Parser().parseFromString(text, 'application/xml');
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length || doc.documentElement.localName === 'parsererror') throw new Error('The Windows Event XML is malformed.');
    const root = doc.documentElement;
    const elements = root.localName === 'Event' ? [root] : root.localName === 'Events' ? Array.from(root.children).filter(n => n.localName === 'Event') : [];
    if (!elements.length) throw new Error('The XML must contain an Event or an Events collection.');
    if (elements.length > P.MAX_RECORDS) throw new Error('XML exceeds the 100,000-record limit.');
    const serializer = new Serializer();
    return elements.map(e => readXmlEvent(e, serializer));
  }
  function readEvtxEvent(record) {
    const o = objectify(record), event = o.Event || {}, sys = event.System || {}, data = event.EventData || {};
    return { type:'windows', timestamp:val(sys.TimeCreated_attributes?.SystemTime), provider:val(sys.Provider_attributes?.Name), channel:val(sys.Channel), eventId:typeof sys.EventID === 'object' ? val(sys.EventID['#text'] ?? sys.EventID.Value) : val(sys.EventID), recordId:val(sys.EventRecordID), computer:val(sys.Computer), username:field(data,'SubjectUserName'), deviceId:field(data,'DeviceId'), original:JSON.stringify(o) };
  }
  async function parseEvtxWithModule(bytes, wasm) {
    const parser = new wasm.EvtxWasmParser(bytes), records = [];
    try {
      const info = objectify(parser.get_file_info());
      if (info.is_dirty) throw new Error('The EVTX header marks this file dirty; use a validated, complete exported copy.');
      if (!Number.isInteger(info.total_chunks) || info.total_chunks < 0 || info.total_chunks > 4096) throw new Error('Invalid EVTX chunk count.');
      for (let i = 0; i < info.total_chunks; i++) {
        const chunk = objectify(parser.parse_chunk(i));
        if (!chunk || !Array.isArray(chunk.records) || (chunk.errors && chunk.errors.length)) throw new Error('EVTX chunk ' + i + ' contains parsing errors.');
        const expected = info.chunks?.[i]?.record_count;
        if (expected != null && Number(expected) !== chunk.records.length) throw new Error('EVTX chunk ' + i + ' has missing or unreadable records.');
        for (const item of chunk.records) { records.push(readEvtxEvent(item)); if (records.length > P.MAX_RECORDS) throw new Error('EVTX exceeds the 100,000-record limit.'); }
        if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
      return records;
    } finally { parser.free(); }
  }
  async function parseEvtx(bytes) {
    const wasm = await import('./wasm/evtx_wasm.js');
    await wasm.default();
    return parseEvtxWithModule(bytes, wasm);
  }
  function parseSetupAPI(text) {
    const lines = text.split(/\r?\n/), records = []; let section = null;
    function finish() {
      if (!section) return;
      const start = section.lines.find(line => /^\s*>>>\s*Section start\s+/i.test(line));
      const match = start && /^\s*>>>\s*Section start\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)/i.exec(start);
      const complete = section.lines.some(line => /^\s*<<<\s*\[Exit status:/i.test(line));
      records.push({ type:'setupapi', incomplete:!complete, timestamp:match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}` : '', deviceId:section.id, original:JSON.stringify({ line:section.line, section:section.lines.join('\n') }) });
      section = null;
    }
    for (let i = 0; i < lines.length; i++) {
      const heading = /^\s*>>>\s*\[Device Install\b.*?\s+-\s+((?:USB|USBSTOR)\\[^\]]+)\]\s*$/i.exec(lines[i]);
      if (/^\s*>>>\s*\[/.test(lines[i])) { finish(); if (heading) section = { id:heading[1], line:i+1, lines:[lines[i]] }; }
      else if (section) { section.lines.push(lines[i]); if (/^\s*<<<\s*\[Exit status:/i.test(lines[i])) finish(); }
      if (records.length > P.MAX_RECORDS) throw new Error('SetupAPI log exceeds the 100,000-record limit.');
    }
    finish(); return records;
  }
  function parseRegistryExport(text) {
    if (!/^Windows Registry Editor Version 5\.00\s*$/im.test(text) && !/^REGEDIT4\s*$/im.test(text)) throw new Error('Choose a Windows Registry Editor .reg export.');
    const artifacts = [], lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^\[([^\]]*\\(?:CurrentControlSet|ControlSet\d{3})\\Enum\\USBSTOR\\([^\\\]]+)\\([^\\\]]+))\]\s*$/i.exec(lines[i].trim());
      if (m) artifacts.push({ deviceId:`USBSTOR\\${m[2]}\\${m[3]}`, keyPath:m[1], line:i+1 });
      if (artifacts.length > P.MAX_RECORDS) throw new Error('Registry export exceeds the 100,000-record limit.');
    }
    return artifacts;
  }
  function materialize(source, settings) {
    if (!source.adapter) return source;
    const context = { host: String(settings?.host || '').trim(), channel: String(settings?.channel || '').trim() };
    const rows = source.nativeRecords.map(r => {
      let provider = r.provider || '', channel = r.channel || context.channel, eventType = unknown, meaning = unknownExplanation;
      if (r.type === 'setupapi') { eventType = installation; meaning = installExplanation + (r.incomplete ? ' This section has no exit status and may be incomplete.' : ''); provider = 'SetupAPI'; channel = 'setupapi.dev.log'; }
      else if (provider.trim().toLowerCase() === 'microsoft-windows-security-auditing' && channel.trim().toLowerCase() === 'security' && String(r.eventId).trim() === '6416') { eventType = recognized; meaning = explanation; }
      return [r.timestamp || '', eventType, r.deviceId || '', r.computer || context.host, r.username || '', provider, channel, r.eventId || '', r.recordId || '', meaning, r.original || ''];
    });
    return { ...source, rows, context, artifacts: source.artifacts.map(a => ({ ...a, computer:context.host })) };
  }
  async function prepareInput(bytes, filename, id, opts) {
    if (bytes.byteLength > P.MAX_BYTES) throw new Error('Source exceeds the 20 MiB input limit.');
    const name = String(filename), ext = name.toLowerCase(); let records, artifacts = [], format;
    if (/\.evtx$/.test(ext)) { format = 'Windows EVTX'; records = await (opts?.evtxParser || parseEvtx)(bytes); }
    else if (/\.xml$/.test(ext)) { format = 'Windows Event XML'; records = parseWindowsXML(decode(bytes,name,true), opts?.DOMParser || globalThis.DOMParser, opts?.XMLSerializer || globalThis.XMLSerializer); }
    else if (/\.log$/.test(ext) || /\.txt$/.test(ext)) { format = 'SetupAPI log'; records = parseSetupAPI(decode(bytes,name,true)); }
    else if (/\.reg$/.test(ext)) { format = 'USBSTOR registry export'; records = []; artifacts = parseRegistryExport(decode(bytes,name,true)); }
    else if (/\.csv(?: \(sample\))?$/.test(ext)) {
      const text = decode(bytes,name,true), parsed = A.parseCSV(text, { maxFields:512 });
      if (parsed.length && isWindowsCSV(parsed[0])) { format = 'Windows Event CSV'; records = parseWindowsCSV(text); }
      else return P.prepareSource(bytes, name, id);
    } else throw new Error('Choose .csv, Windows Event .xml or .evtx, SetupAPI .log, or a .reg export.');
    const source = { id:String(id), filename:name, size:bytes.byteLength, sha256:await hash(bytes), format, adapter:true, headers:HEADERS, rows:[], nativeRecords:records, artifacts, suggestedMapping:{ ...MAPPING } };
    return materialize(source, {});
  }
  function identity(record) { const host = String(record.computer || '').trim().toLowerCase(), id = String(record.deviceId || '').trim().toLowerCase(); return host && id ? JSON.stringify([host, id]) : ''; }
  function correlate(events, sources) {
    const groups = new Map(), hostGroups = new Map(), pairs = [], conflicts = []; let truncated = false;
    for (const e of events) {
      const k = identity(e); if (!k) continue;
      if (!groups.has(k)) groups.set(k, new Map());
      const group = groups.get(k);
      if (!group.has(e.source.id)) group.set(e.source.id, []);
      group.get(e.source.id).push(e);
      const id = e.deviceId.trim().toLowerCase(), host = e.computer.trim().toLowerCase();
      if (!hostGroups.has(id)) hostGroups.set(id, new Map());
      if (!hostGroups.get(id).has(host)) hostGroups.get(id).set(host, e);
    }
    for (const hosts of hostGroups.values()) {
      if (hosts.size < 2) continue;
      const [a,b] = [...hosts.values()];
      conflicts.push({ kind:'Same ID on different hosts', a, b, reason:'The same full ID appears on different named hosts. This may reflect a portable device, reused identifier, or host naming differences; physical identity remains unverified.', deltaMs:null });
      if (conflicts.length >= 100) break;
    }
    const compare = (a,b) => a.ms-b.ms || a.microRemainder-b.microRemainder || (a.nanoRemainder||0)-(b.nanoRemainder||0);
    outer: for (const group of groups.values()) {
      const streams = [...group.values()];
      if (streams.length < 2) continue;
      for (const stream of streams) stream.sort(compare);
      for (let i=0;i<streams.length;i++) for (let j=i+1;j<streams.length;j++) {
        const left=streams[i], right=streams[j]; let first=0;
        for (const event of left) {
          while (first < right.length && right[first].ms < event.ms-WINDOW_MS) first++;
          for (let k=first;k<right.length && right[k].ms<=event.ms+WINDOW_MS;k++) {
            const other=right[k], a=compare(event,other)<=0?event:other, b=a===event?other:event;
            const deltaNanos = BigInt(b.ms-a.ms)*1000000n + BigInt(b.microRemainder-a.microRemainder)*1000n + BigInt((b.nanoRemainder||0)-(a.nanoRemainder||0));
            if (deltaNanos > BigInt(WINDOW_MS)*1000000n) continue;
            pairs.push({ kind:'Timed records', a, b, reason:'Same explicit host and full device ID; timestamps within five minutes. Identity and physical activity require independent verification.', deltaMs:Number(deltaNanos)/1000000 });
            if (pairs.length >= MAX_MATCHES) { truncated = true; break outer; }
          }
        }
      }
    }
    registry: if (!truncated) for (const source of sources) for (const artifact of source.artifacts || []) {
      const k=identity(artifact), group=groups.get(k); if(!k || !group) continue;
      for (const [sourceId, stream] of group) {
        if (sourceId === source.id) continue;
        for (const e of stream) {
          pairs.push({ kind:'Registry identity only', a:e, b:{ source, recordNumber:'key line '+artifact.line, timestamp:'No timestamp', deviceId:artifact.deviceId, computer:artifact.computer }, reason:'Same analyst-supplied host and full device ID. The exported registry key has no timestamp; no time comparison is possible.', deltaMs:null });
          if (pairs.length >= MAX_MATCHES) { truncated=true; break registry; }
        }
      }
    }
    return { pairs, conflicts, truncated, maximum:MAX_MATCHES };
  }
  function exportCorrelations(result) {
    const rows=[['match_type','device_id','host_a','source_a','sha256_a','record_a','time_a_utc','host_b','source_b','sha256_b','record_b','time_b_utc','delta_ms','reason']];
    for(const p of [...result.pairs, ...(result.conflicts || [])]) rows.push([p.kind,p.a.deviceId,p.a.computer,p.a.source.filename,p.a.source.sha256,p.a.recordNumber,p.a.timestamp,p.b.computer,p.b.source.filename,p.b.source.sha256,p.b.recordNumber,p.b.timestamp,p.deltaMs == null ? '' : p.deltaMs,p.reason]);
    return '\uFEFF'+rows.map(row=>row.map(v=>'"'+A.spreadsheetSafe(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  }
  function exportArtifacts(sources) {
    const rows=[['device_id','analyst_supplied_host','registry_key_path','source_file','source_sha256','source_line']];
    for (const source of sources) for (const a of source.artifacts || []) rows.push([a.deviceId,a.computer,a.keyPath,source.filename,source.sha256,a.line]);
    return '\uFEFF'+rows.map(row=>row.map(v=>'"'+A.spreadsheetSafe(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  }
  return { HEADERS, MAPPING, MAX_MATCHES, WINDOW_MS, isWindowsCSV, parseWindowsCSV, parseWindowsXML, readEvtxEvent, parseEvtxWithModule, parseSetupAPI, parseRegistryExport, materialize, prepareInput, correlate, exportCorrelations, exportArtifacts, objectify };
});
