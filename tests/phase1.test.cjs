'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../phase1.js');
const encode = text => new TextEncoder().encode(text);
const zone = (mode, value) => ({ mode, value });
const config = (source, z = zone('fixed', '+00:00')) => ({ mapping: source.suggestedMapping, zone: z });

test('selected browser files are read even when Blob exposes a bytes() method', async () => {
  const original = encode('timestamp,event_type,device_id\n2026-01-01T00:00Z,connected,A\n');
  const fileLike = { bytes: () => Promise.resolve(original), arrayBuffer: async () => original.buffer };
  const read = await P.readInputBytes(fileLike);
  assert.deepEqual(read, original);
  assert.equal((await P.prepareSource(read, 'selected.csv', 'S01')).rows.length, 1);
  assert.deepEqual(await P.readInputBytes({ bytes: original }), original);
  if (typeof File !== 'undefined') assert.deepEqual(await P.readInputBytes(new File([original], 'selected.csv')), original);
  await assert.rejects(P.readInputBytes({}), /Could not read/);
});

test('two-file demo matches its source CSVs and demonstrates Phase 1 review', async () => {
  const sandbox = { window: {} }, root = path.resolve(__dirname, '..');
  vm.runInNewContext(fs.readFileSync(path.join(root, 'samples/phase1-sample-data.js'), 'utf8'), sandbox);
  const sources = [];
  for (let i = 0; i < sandbox.window.USB_PHASE1_SAMPLE_FILES.length; i++) {
    const item = sandbox.window.USB_PHASE1_SAMPLE_FILES[i];
    const source = fs.readFileSync(path.join(root, 'samples/phase1-source-' + (i ? 'b' : 'a') + '.csv'), 'utf8');
    assert.equal(item.content, source);
    sources.push(await P.prepareSource(encode(item.content), item.name, 'S0' + (i + 1)));
  }
  const configs = Object.fromEntries(sources.map(s => [s.id, config(s, zone('iana', 'America/New_York'))]));
  const data = P.analyzeSources(sources, configs);
  assert.equal(data.events.length, 3);
  assert.equal(data.unresolvedTimes, 2);
  assert.equal(data.duplicateCandidates, 1);
});

test('preview retains original headers and values; ambiguous aliases require a manual mapping', async () => {
  const text = 'Time,Timestamp,Action,Device ID,Host\n2026-01-01T00:00Z,other,connected," USB-1 ",Lab\n';
  const source = await P.prepareSource(encode(text), 'first.csv', 'S01');
  assert.deepEqual(source.headers, ['Time', 'Timestamp', 'Action', 'Device ID', 'Host']);
  assert.equal(source.rows[0][3], ' USB-1 ');
  assert.equal(source.suggestedMapping.timestamp, null);
  assert.equal(source.suggestedMapping.event_type, 2);
  assert.equal(source.suggestedMapping.device_id, 3);
  assert.throws(() => P.validateMapping(source, source.suggestedMapping), /map the timestamp/);
  const mapping = { ...source.suggestedMapping, timestamp: 0 };
  P.validateMapping(source, mapping);
  assert.throws(() => P.validateMapping(source, { ...mapping, device_id: 2 }), /different column/);
  assert.equal(source.sha256, crypto.createHash('sha256').update(encode(text)).digest('hex'));
});

test('duplicate or blank headers can be mapped by distinct column positions', async () => {
  const s = await P.prepareSource(encode('time,time,action,\n2026-01-01T00:00Z,other,connected,ID-1\n'), 'headers.csv', 'S01');
  assert.equal(s.suggestedMapping.timestamp, null);
  const mapping = { timestamp: 0, event_type: 2, device_id: 3, computer: null, username: null };
  const data = P.analyzeSources([s], { S01: { mapping, zone: zone('fixed','+00:00') } });
  assert.equal(data.events[0].deviceId, 'ID-1');
  assert.equal(data.sources[0].mapping.device_id.column, 4);
  assert.equal(data.sources[0].mapping.device_id.header, '');
});

test('multiple sources retain provenance and flag matching mapped fields without removing either record', async () => {
  const s1 = await P.prepareSource(encode('Time,Action,Device ID,Host,Extra\n2026-01-01T00:00Z,connected,A,PC,one\n'), 'same.csv', 'S01');
  const s2 = await P.prepareSource(encode('timestamp,event_type,device_id,computer,extra\n2026-01-01T00:00Z,connected,A,PC,two\n'), 'same.csv', 'S02');
  const data = P.analyzeSources([s1, s2], { S01: config(s1), S02: config(s2) });
  assert.equal(data.totalRecords, 2);
  assert.equal(data.events.length, 2);
  assert.equal(data.duplicateCandidates, 1);
  assert.equal(data.issues[0].code, 'duplicate_candidate');
  assert.deepEqual(data.issues[0].originalValues, s2.rows[0]);
  assert.equal(data.issues[0].duplicateOf.sourceId, 'S01');
  assert.equal(data.events[1].source.id, 'S02');
  assert.equal(data.sources[0].mapping.device_id.header, 'Device ID');
  assert.equal(P.filterEvents(data.events, 'S02', 'connected').length, 1);
  assert.notEqual(data.sources[0].sha256, data.sources[1].sha256);
});

test('all skipped, unknown and missing-ID rows are preserved as separate review entries', async () => {
  const s = await P.prepareSource(encode('timestamp,event_type,device_id\ninvalid,connected,A\n2026-01-01T00:00Z,observed,\n2026-01-01T01:00Z,connected,A,EXTRA\n'), 'quality.csv', 'S01');
  const data = P.analyzeSources([s], { S01: config(s) });
  assert.equal(data.events.length, 1);
  assert.equal(data.skipped, 2);
  assert.deepEqual(data.issues.map(i => i.code), ['invalid_timestamp','unknown_event_type','missing_device_id','extra_values']);
  assert.deepEqual(data.issues.at(-1).originalValues, ['2026-01-01T01:00Z','connected','A','EXTRA']);
  assert.equal(data.events[0].eventType, 'other');
});

test('IANA zones distinguish normal, ambiguous and nonexistent local times', () => {
  const ny = zone('iana', 'America/New_York');
  const winter = P.interpretTimestamp('2026-01-12T08:00:00.123456', ny);
  assert.equal(winter.time.utc, '2026-01-12T13:00:00.123456Z');
  const summer = P.interpretTimestamp('2026-07-12T08:00:00', ny);
  assert.equal(summer.time.utc, '2026-07-12T12:00:00Z');
  const ambiguous = P.interpretTimestamp('2026-11-01T01:30:00', ny);
  assert.equal(ambiguous.kind, 'ambiguous_time');
  assert.deepEqual(ambiguous.candidates.map(c => c.utc), ['2026-11-01T05:30:00Z','2026-11-01T06:30:00Z']);
  const gap = P.interpretTimestamp('2026-03-08T02:30:00', ny);
  assert.equal(gap.kind, 'nonexistent_time');
  assert.equal(gap.candidates.length, 0);
  assert.equal(P.interpretTimestamp('2026-11-01T01:30:00-05:00', ny).time.utc, '2026-11-01T06:30:00Z');
});

test('non-hour DST changes and fixed-offset interpretation are handled explicitly', () => {
  const lord = P.interpretTimestamp('2026-04-05T01:45:00', zone('iana', 'Australia/Lord_Howe'));
  assert.equal(lord.kind, 'ambiguous_time');
  assert.deepEqual(lord.candidates.map(c => c.offset), ['+11:00','+10:30']);
  assert.equal(P.interpretTimestamp('2026-01-01T11:30', zone('fixed', '+05:30')).time.utc, '2026-01-01T06:00:00Z');
  assert.equal(P.interpretTimestamp('2026-01-01T11:30', zone('iana', 'Asia/Kolkata')).time.utc, '2026-01-01T06:00:00Z');
  assert.equal(P.interpretTimestamp('1600-01-01T00:00', zone('iana','UTC')).state, 'invalid');
  assert.equal(P.interpretTimestamp('1600-01-01T00:00Z', zone('iana','UTC')).state, 'ok');
  assert.throws(() => P.validateZone(zone('iana','Not/AZone')), /Unknown IANA/);
});

test('analysts can resolve DST rows while original evidence and the decision remain visible', async () => {
  const s = await P.prepareSource(encode('timestamp,event_type,device_id\n2026-11-01T01:30:00,connected,A\n2026-03-08T02:30:00,connected,B\n'), 'dst.csv', 'S01');
  const cfg = { S01: config(s, zone('iana','America/New_York')) };
  let data = P.analyzeSources([s], cfg);
  assert.equal(data.unresolvedTimes, 2);
  assert.equal(data.events.length, 0);
  assert.throws(() => P.analyzeSources([s], cfg, { 'S01:3': { type:'override', value:'2026-03-08T03:30:00' } }), /must include/);
  data = P.analyzeSources([s], cfg, {
    'S01:2': { type:'candidate', utc:'2026-11-01T06:30:00Z' },
    'S01:3': { type:'override', value:'2026-03-08T03:30:00-04:00' }
  });
  assert.equal(data.unresolvedTimes, 0);
  assert.equal(data.events.length, 2);
  assert.ok(data.issues.every(i => i.resolved));
  assert.equal(data.events.find(e => e.recordNumber === 2).originalTimestamp, '2026-11-01T01:30:00');
  assert.equal(data.events.find(e => e.recordNumber === 3).resolvedInput, '2026-03-08T03:30:00-04:00');
  assert.deepEqual(s.rows[1], ['2026-03-08T02:30:00','connected','B']);
  assert.throws(() => P.analyzeSources([s], cfg, { 'S01:2': { type:'candidate', utc:'2026-11-01T07:30:00Z' } }), /no longer valid/);
});

test('quality and events exports include source mapping, original fields and spreadsheet protection', async () => {
  const s = await P.prepareSource(encode('timestamp,event_type,device_id,user\n2026-01-01T00:00Z,connected,=1+1,+attacker\ninvalid,observed,,bob\n'), '=source.csv', 'S01');
  const data = P.analyzeSources([s], { S01: config(s) });
  const csv = P.exportEventsCSV(data, data.events), errors = P.exportIssuesCSV(data);
  assert.ok(csv.includes(s.sha256));
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'\+attacker"/);
  assert.match(csv, /"'=source.csv"/);
  assert.match(csv, /source_column_mapping_json/);
  assert.match(csv, /original_values_json/);
  assert.match(errors, /unknown_event_type/);
  assert.match(errors, /missing_device_id/);
  assert.match(errors, /invalid_timestamp/);
  assert.ok(errors.includes(s.sha256));
  assert.match(P.reportText(data, data.events, '', 'all'), /SOURCE FILES AND IMPORT DECISIONS/);
});

test('chunked downloads preserve every row across chunk boundaries', async () => {
  const s = await P.prepareSource(encode('timestamp,event_type,device_id\n2026-01-01T00:00Z,observed,\n'), 'rows.csv', 'S01');
  const data = P.analyzeSources([s], { S01: config(s) });
  const events = Array.from({ length: 1201 }, () => data.events[0]);
  const repeatedIssues = { ...data, issues: Array.from({ length: 1001 }, () => data.issues[0]) };
  const eventChunks = P.exportEventsCSVChunks(data, events), issueChunks = P.exportIssuesCSVChunks(repeatedIssues);
  assert.equal(eventChunks.length, 4);
  assert.equal(issueChunks.length, 4);
  assert.equal(eventChunks.join(''), P.exportEventsCSV(data, events));
  assert.equal(issueChunks.join(''), P.exportIssuesCSV(repeatedIssues));
  assert.equal(eventChunks.join('').split('\r\n').length, 1203);
});

test('combined size, source count and record limits are enforced', () => {
  const fake = (id, size, count) => ({ id, size, rows: Array(count) });
  assert.throws(() => P.validateCollection(Array.from({ length:21 }, (_,i) => fake(String(i),1,0))), /20 files/);
  assert.throws(() => P.validateCollection([fake('a',P.MAX_BYTES,0),fake('b',1,0)]), /20 MiB/);
  assert.throws(() => P.validateCollection([fake('a',1,50001),fake('b',1,50000)]), /100,000/);
  assert.throws(() => P.validateCollection([fake('a',1,0),fake('a',1,0)]), /unique/);
});

test('column limit and malformed or non-UTF-8 files fail before analysis', async () => {
  const columns = Array.from({ length: 257 }, (_, i) => 'col' + i).join(',') + '\n';
  await assert.rejects(P.prepareSource(encode(columns), 'wide.csv', 'S01'), /256 columns/);
  const excessiveValues = 'timestamp,event_type,device_id\n' + Array(513).fill('x').join(',') + '\n';
  await assert.rejects(P.prepareSource(encode(excessiveValues), 'wide-row.csv', 'S01'), /512-value/);
  await assert.rejects(P.prepareSource(encode('timestamp,event_type,device_id\n\"not closed'), 'broken.csv', 'S01'), /Malformed CSV/);
  await assert.rejects(P.prepareSource(Uint8Array.from([0xff]), 'invalid.csv', 'S01'), /UTF-8/);
});
