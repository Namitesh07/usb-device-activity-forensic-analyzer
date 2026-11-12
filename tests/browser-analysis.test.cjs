'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const A = require('../analysis.js');
const root = path.resolve(__dirname, '..');
const sampleBytes = fs.readFileSync(path.join(root, 'samples/fictional_usb_activity.csv'));
const encode = text => new TextEncoder().encode(text);

test('embedded sample exactly matches the CSV and produces the documented counts and hash', async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'samples/sample-data.js'), 'utf8'), sandbox);
  assert.equal(sandbox.window.USB_SAMPLE_CSV, sampleBytes.toString('utf8'));
  const data = await A.loadBytes(sampleBytes, 'sample.csv', '+00:00');
  const summary = A.summarize(data.events);
  assert.equal(data.sha256, crypto.createHash('sha256').update(sampleBytes).digest('hex'));
  assert.equal(data.totalRecords, 17);
  assert.equal(data.events.length, 16);
  assert.equal(data.issues.length, 1);
  assert.equal(summary.connections, 9);
  assert.equal(summary.devices.length, 3);
  assert.equal(summary.repeated, 3);
  assert.equal(summary.missingIds, 1);
});

test('timestamps validate calendar dates, offsets, UTC overflow and microsecond ordering', () => {
  const data = A.parsePreparedCSV('timestamp,event_type,device_id\n2026-01-01T11:30:00.123456+05:30,connected,A\n2026-01-01 11:30:00.123455,connected,A\n', '+05:30');
  assert.equal(data.events[0].timestamp, '2026-01-01T06:00:00.123455Z');
  assert.equal(data.events[1].timestamp, '2026-01-01T06:00:00.123456Z');
  assert.equal(data.naiveTimestamps, 1);
  assert.equal(A.parseTimestamp('1600-01-01T00:00:00Z', 0).utc, '1600-01-01T00:00:00Z');
  for (const value of ['2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T12:00:00.1234567Z', '0001-01-01T00:00:00+23:00', '2026-01-01T25:00Z']) {
    assert.throws(() => A.parseTimestamp(value, 0), value);
  }
  assert.throws(() => A.parseOffset('+24:00'));
  assert.throws(() => A.parseOffset('UTC'));
});

test('CSV parser handles quoted commas, quotes and newlines while retaining duplicates', () => {
  const data = A.parsePreparedCSV('timestamp,event_type,device_id,computer,username\r\n2026-01-01T00:00:00Z,connected,"device,A",host,"alice\nsmith"\r\n2026-01-01T00:00:00Z,connected,"device,A",host,"alice\nsmith"\r\n2026-01-01T00:00:01Z,observed,"device,A",host,"A ""quoted"" user"\r\n', '+00:00');
  assert.equal(data.totalRecords, 3);
  assert.equal(data.events[0].deviceId, 'device,A');
  assert.equal(data.events[0].username, 'alice\nsmith');
  assert.equal(data.events[2].username, 'A "quoted" user');
  assert.equal(A.summarize(data.events).devices[0].connections, 2);
  assert.equal(A.summarize(data.events).repeated, 1);
  assert.equal(A.filterEvents(data.events, 'alice', 'connected').length, 2);
});

test('invalid input is rejected and invalid rows are identified without discarding valid rows', async () => {
  assert.throws(() => A.parsePreparedCSV('time,event_type,device_id\nx,y,z\n', '+00:00'), /Missing required/);
  assert.throws(() => A.parsePreparedCSV('timestamp,Timestamp,event_type,device_id\n', '+00:00'), /unique/);
  assert.throws(() => A.parsePreparedCSV('timestamp,event_type,device_id\n2026-01-01T00:00:00Z,connected,"open\n', '+00:00'), /not closed/);
  const data = A.parsePreparedCSV('timestamp,event_type,device_id\ninvalid,connected,A\n2026-01-01T00:00:00Z,connected,A,EXTRA\n2026-01-01T01:00:00Z,connected,\n', '+00:00');
  assert.equal(data.issues.length, 2);
  assert.equal(data.events.length, 1);
  assert.equal(A.summarize(data.events).missingIds, 1);
  await assert.rejects(A.loadBytes(Uint8Array.from([255, 254]), 'bad.csv', '+00:00'), /UTF-8/);
  await assert.rejects(A.loadBytes(new Uint8Array(A.MAX_BYTES + 1), 'large.csv', '+00:00'), /20 MiB/);
  assert.throws(() => A.parsePreparedCSV('timestamp,event_type,device_id\n' + '2026-01-01T00:00Z,connected,A\n'.repeat(A.MAX_RECORDS + 1), '+00:00'), /100,000/);
});

test('exports include only filtered evidence, provenance and spreadsheet formula protection', async () => {
  const data = await A.loadBytes(encode('timestamp,event_type,device_id,username\n2026-01-01T00:00:00Z,connected,=2+2,+attacker\n2026-01-01T01:00:00Z,disconnected,A,bob\n'), 'source.csv', '+00:00');
  const filtered = A.filterEvents(data.events, '', 'connected');
  const csv = A.exportCSV(data, filtered);
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"'\+attacker"/);
  assert.ok(csv.includes(data.sha256));
  assert.ok(!csv.includes('bob'));
  assert.equal(A.spreadsheetSafe('  @payload'), "'  @payload");
  const report = A.reportText(data, filtered, '', 'connected');
  assert.match(report, /Records: 1/);
  assert.match(report, /not proof of unauthorized use/);
  assert.ok(report.includes(data.sha256));
});
