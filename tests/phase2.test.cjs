'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const A = require('../analysis.js');
const P = require('../phase1.js');
const E = require('../phase2.js');
const root = path.resolve(__dirname, '..');
const bytes = text => new TextEncoder().encode(text);
const settings = (s, extra={}) => ({ mapping:s.suggestedMapping, zone:{ mode:'fixed', value:'+00:00' }, ...extra });
const src = (name) => fs.readFileSync(path.join(root, 'samples', name));

test('fictional Windows demo files match the embedded samples', () => {
  const sandbox = { window:{} }; vm.runInNewContext(src('phase2-sample-data.js').toString(), sandbox);
  for (const f of sandbox.window.USB_PHASE2_SAMPLE_FILES) assert.equal(f.content, src(f.name).toString());
});

test('Windows Event CSV uses provider, channel, and ID together and retains original fields', async () => {
  const input = src('phase2-windows-events.csv');
  const s = await E.prepareInput(input, 'events.csv', 'S01');
  assert.equal(s.format, 'Windows Event CSV');
  assert.equal(s.sha256, crypto.createHash('sha256').update(input).digest('hex'));
  assert.equal(s.rows[0][1], 'External device recognized');
  assert.match(s.rows[0][9], /does not by itself prove a physical insertion/);
  assert.equal(s.rows[0][0], '2026-01-15T10:00:00.123456789Z');
  assert.match(s.rows[0][10], /EventRecordID/);
  const input2 = 'Date and Time,Source,Event ID,Computer,DeviceId\n2026-01-01T00:00Z,Microsoft-Windows-Security-Auditing,6416,LAB,A\n';
  const missing = await E.prepareInput(bytes(input2), 'event.csv', 'S02');
  assert.equal(missing.rows[0][1], 'Unmapped Windows event');
  assert.equal(E.materialize(missing, { channel:'Security' }).rows[0][1], 'External device recognized');
  assert.equal(E.materialize(missing, { channel:'System' }).rows[0][1], 'Unmapped Windows event');
  const wrong = input2.replace('Microsoft-Windows-Security-Auditing','Other-Provider');
  assert.equal(E.materialize(await E.prepareInput(bytes(wrong), 'wrong.csv','S03'),{channel:'Security'}).rows[0][1], 'Unmapped Windows event');
  const localized = input2.replace('2026-01-01T00:00Z','01/02/2026 10:00');
  const l = E.materialize(await E.prepareInput(bytes(localized),'localized.csv','S04'),{channel:'Security'});
  assert.equal(P.analyzeSources([l], { S04:settings(l) }).skipped, 1);
});

test('SetupAPI recognizes only explicit USB installation sections and never labels them as connections', async () => {
  const input=src('phase2-setupapi.log');
  const s=E.materialize(await E.prepareInput(input,'setupapi.dev.log','S02'),{host:'LAB-PC-01'});
  assert.equal(s.rows.length, 1); assert.equal(s.rows[0][1], 'Device installation section');
  assert.equal(s.rows[0][0], '2026-01-15T10:04:00.000');
  assert.equal(s.rows[0][3], 'LAB-PC-01');
  assert.match(s.rows[0][9], /not a verified physical connection time/);
  assert.match(s.rows[0][10], /DIF_INSTALLDEVICE/);
  const result=P.analyzeSources([s],{S02:settings(s)});
  assert.equal(result.events[0].eventType, 'other'); assert.equal(A.summarize(result.events).connections,0);
  assert.equal(E.parseSetupAPI('>>>  [Device Install (Hardware initiated) - PCI\\VEN_1\\X]\n>>>  Section start 2026/01/01 10:00:00.000').length,0);
});

test('registry exports expose USBSTOR keys without inventing a connection time', async () => {
  const s=E.materialize(await E.prepareInput(src('phase2-usbstor.reg'),'offline.reg','S03'),{host:'LAB-PC-01'});
  assert.equal(s.artifacts.length,1); assert.equal(s.rows.length,0);
  assert.equal(s.artifacts[0].deviceId,'USBSTOR\\Disk&Ven_Demo&Prod_Storage\\DEMO001');
  assert.equal(s.artifacts[0].line,3);
  assert.match(E.exportArtifacts([s]),/ControlSet001/);
  assert.throws(()=>E.parseRegistryExport('not a registry file'),/Registry Editor/);
  const utf16=Buffer.concat([Buffer.from([255,254]), Buffer.from(src('phase2-usbstor.reg').toString(),'utf16le')]);
  assert.equal((await E.prepareInput(utf16,'offline.reg','S03')).artifacts.length,1);
});

test('cross-source links require full ID and host, respect time window, and disclose untimed registry matches', async () => {
  const a=await E.prepareInput(src('phase2-windows-events.csv'),'events.csv','S01');
  const b=E.materialize(await E.prepareInput(src('phase2-setupapi.log'),'setup.log','S02'),{host:'LAB-PC-01'});
  const c=E.materialize(await E.prepareInput(src('phase2-usbstor.reg'),'offline.reg','S03'),{host:'LAB-PC-01'});
  const sources=[a,b,c], configs=Object.fromEntries(sources.map(s=>[s.id,settings(s)]));
  const data=P.analyzeSources(sources,configs), r=E.correlate(data.events,sources);
  assert.equal(data.events.length,3); assert.equal(A.summarize(data.events).connections,0);
  assert.equal(r.pairs.filter(p=>p.kind==='Timed records').length,2);
  assert.equal(r.pairs.filter(p=>p.kind==='Registry identity only').length,3);
  assert.match(r.pairs.find(p=>p.kind==='Registry identity only').reason,/no time comparison/);
  assert.match(E.exportCorrelations(r),/source_sha256|sha256_a/);
  const changed={...b,rows:b.rows.map(row=>{ const copy=row.slice();copy[3]='OTHER-HOST';return copy; })};
  const d=P.analyzeSources([a,changed],{S01:settings(a),S02:settings(changed)});
  assert.equal(E.correlate(d.events,[a,changed]).pairs.length,0);
});

test('fractional precision is retained and sorted in fixed and IANA zones', async () => {
  const text='timestamp,event_type,device_id\n2026-01-01T00:00:00.123456789Z,connected,A\n2026-01-01T00:00:00.123456788Z,connected,A\n';
  const s=await E.prepareInput(bytes(text),'prepared.csv','S01');
  const d=P.analyzeSources([s],{S01:settings(s)});
  assert.equal(d.events[0].timestamp,'2026-01-01T00:00:00.123456788Z');
  assert.equal(d.events[1].timestamp,'2026-01-01T00:00:00.123456789Z');
  const time=P.interpretTimestamp('2026-01-01T05:30:00.123456789',{mode:'iana',value:'Asia/Kolkata'});
  assert.equal(time.time.utc,'2026-01-01T00:00:00.123456789Z');
});

test('EVTX wrapper rejects missing records, dirty files, and parser errors', async () => {
  let freed=false;
  const stub=(info,chunk)=>({EvtxWasmParser:class { get_file_info(){return info;} parse_chunk(){return chunk;} free(){freed=true;} }});
  const info={total_chunks:1,is_dirty:false,chunks:[{record_count:'1'}]};
  await assert.rejects(E.parseEvtxWithModule(new Uint8Array(),stub(info,{records:[],errors:[]})),/missing or unreadable/);
  assert.equal(freed,true);
  await assert.rejects(E.parseEvtxWithModule(new Uint8Array(),stub({...info,is_dirty:true},{})),/dirty/);
  await assert.rejects(E.parseEvtxWithModule(new Uint8Array(),stub(info,{records:[],errors:['broken']})),/parsing errors/);
  const record={ Event:{System:{Provider_attributes:{Name:'Microsoft-Windows-Security-Auditing'},Channel:'Security',EventID:6416,EventRecordID:99,Computer:'LAB',TimeCreated_attributes:{SystemTime:'2026-01-01T00:00:00Z'}},EventData:{DeviceId:'USB\\A\\B'}}};
  const output=await E.parseEvtxWithModule(new Uint8Array(),stub(info,{records:[record],errors:[]}));
  assert.equal(output[0].recordId,'99'); assert.equal(output[0].deviceId,'USB\\A\\B');
});

test('association boundaries preserve nanoseconds and surface IDs on different hosts', async () => {
  const one = await E.prepareInput(bytes('timestamp,event_type,device_id,computer\n2026-01-01T00:00:00.000000001Z,connected,A,HOST-A\n'),'a.csv','S01');
  const two = await E.prepareInput(bytes('timestamp,event_type,device_id,computer\n2026-01-01T00:05:00.000000002Z,connected,A,HOST-A\n2026-01-01T00:01:00Z,connected,A,HOST-B\n'),'b.csv','S02');
  const data = P.analyzeSources([one,two],{ S01:settings(one), S02:settings(two) });
  const result = E.correlate(data.events,[one,two]);
  assert.equal(result.pairs.length,0);
  assert.equal(result.conflicts.length,1);
  const csv = E.exportCorrelations(result);
  assert.match(csv,/HOST-A/); assert.match(csv,/HOST-B/);
  assert.match(csv,/physical identity remains unverified/);
});

test('analyst source context is retained in events and reports', async () => {
  const s=E.materialize(await E.prepareInput(src('phase2-setupapi.log'),'setup.log','S01'),{host:'LAB-PC-01'});
  const data=P.analyzeSources([s],{S01:settings(s)});
  const csv=P.exportEventsCSV(data,data.events), report=P.reportText(data,data.events,'','all');
  assert.match(csv,/analyst_supplied_context_json/); assert.match(csv,/LAB-PC-01/);
  assert.match(report,/analyst context:.*LAB-PC-01/);
});

test('many same-source records do not become cross-source matches', () => {
  const source={id:'S01',filename:'input.csv',sha256:'test'};
  const events=Array.from({length:10000},(_,i)=>({source,recordNumber:i,computer:'LAB',deviceId:'USB-A',ms:0,microRemainder:0,nanoRemainder:0}));
  const result=E.correlate(events,[{...source,artifacts:[{computer:'LAB',deviceId:'USB-A',line:1}]}]);
  assert.equal(result.pairs.length,0); assert.equal(result.truncated,false);
});
