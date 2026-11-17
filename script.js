(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const A = window.USBAnalysis, P = window.USBPhase1, E = window.USBPhase2, W = window.USBPhase3, R = window.USBReview;
  const state = { files: [], draftSources: [], draftConfigs: {}, caseSources: [], caseConfigs: {}, resolutions: {},
    data: null, baseline: null, baselineIndex: null, baselineStates: new Map(), baselineCounts: {}, review: null, selectedFindings: new Set(), reviewPage: 0, correlations: null, filtered: [], stats: null, groups: [], zone: 'UTC', appliedFilters: {}, drill: null, drillPage: 0, artifactPage: 0, notes: [], noteTarget: {kind:'case',label:'Case'}, editingNote: null, eventPage: 0, devicePage: 0, issuePage: 0, busy: false, filterTimer: null };
  const PAGE_SIZE = 20, DEVICE_PAGE_SIZE = 10, ISSUE_PAGE_SIZE = 10;
  const FIELD_LABELS = { timestamp: 'Timestamp', event_type: 'Prepared event label', device_id: 'Device ID', computer: 'Computer', username: 'User' };
  const number = value => new Intl.NumberFormat().format(value);
  const setText = (id, value) => { $(id).textContent = String(value); };
  function status(id, message, error) { setText(id, message); $(id).classList.toggle('error', !!error); }
  function create(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }
  function cell(row, value, className) { row.appendChild(create('td', className || '', value === '' || value == null ? '—' : value)); }
  function blankRow(body, cols, message) {
    const tr = create('tr'), td = create('td', 'empty-row', message); td.colSpan = cols; tr.appendChild(td); body.appendChild(tr);
  }
  function scrollToElement(element) {
    element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function setBusy(busy) {
    state.busy = busy;
    $('prepare').disabled = busy || !state.files.length;
    $('analyze').disabled = busy || !state.draftSources.length || !$('mapping-confirm').checked;
    $('demo').disabled = busy; $('demo-multi').disabled = busy; $('demo-phase2').disabled = busy; $('demo-top').disabled = busy; $('file-input').disabled = busy;
    $('mapping-confirm').disabled = busy;
    $('preview-sources').querySelectorAll('input, select').forEach(control => { control.disabled = busy; });
    $('clear-case').disabled = busy;
  }
  function resetDraft() {
    state.draftSources = []; state.draftConfigs = {};
    $('mapping-confirm').checked = false; $('preview').hidden = true; $('preview-sources').replaceChildren();
    $('analyze').disabled = true; status('preview-status', '');
  }
  function chooseFiles(fileList) {
    if (state.busy) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    state.files = []; resetDraft();
    if (files.length > P.MAX_FILES) { setText('file-label', 'No files selected'); status('status', 'Choose no more than 20 files at once.', true); setBusy(false); return; }
    if (files.some(file => !/\.(?:csv|xml|evtx|log|txt|reg)$/i.test(file.name))) { setText('file-label', 'No files selected'); status('status', 'Choose .csv, .xml, .evtx, .log, .txt, or .reg files.', true); setBusy(false); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) > P.MAX_BYTES) { setText('file-label', 'No files selected'); status('status', 'Combined file size exceeds the 20 MiB limit.', true); setBusy(false); return; }
    state.files = files;
    setText('file-label', number(files.length) + (files.length === 1 ? ' file' : ' files') + ' selected · ' + number(files.reduce((sum, f) => sum + f.size, 0)) + ' bytes');
    status('status', 'Files selected. Preview and review each source before analysis.'); setBusy(false);
  }
  $('file-input').addEventListener('change', event => chooseFiles(event.target.files));
  const drop = $('drop-zone');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); if (!state.busy) drop.classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', event => chooseFiles(event.dataTransfer.files));

  async function prepareFiles(sample) {
    if (state.busy || (!sample && !state.files.length)) return;
    setBusy(true); status('status', sample ? 'Preparing fictional sample data…' : 'Reading and fingerprinting the selected evidence locally…');
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const inputs = sample === 'phase2' ? window.USB_PHASE2_SAMPLE_FILES.map(file => ({ name: file.name, bytes: new TextEncoder().encode(file.content) })) : sample === 'multi' ? window.USB_PHASE1_SAMPLE_FILES.map(file => ({ name: file.name, bytes: new TextEncoder().encode(file.content) })) :
        sample ? [{ name: 'fictional_usb_activity.csv (sample)', bytes: new TextEncoder().encode(window.USB_SAMPLE_CSV) }] : state.files;
      const sources = [];
      for (let i = 0; i < inputs.length; i++) {
        const item = inputs[i], bytes = await P.readInputBytes(item);
        sources.push(await E.prepareInput(bytes, item.name, 'S' + String(i + 1).padStart(2, '0')));
        P.validateCollection(sources);
      }
      const configs = {};
      sources.forEach(source => { configs[source.id] = { mapping: { ...source.suggestedMapping }, host: sample === 'phase2' && source.format !== 'Windows Event CSV' ? 'LAB-PC-01' : '', channel: '', zone: sample === 'multi' ? { mode: 'iana', value: 'America/New_York' } : { mode: 'fixed', value: '+00:00' } }; });
      state.draftSources = sources; state.draftConfigs = configs;
      $('file-input').value = '';
      if (sample) { state.files = []; setText('file-label', sample === 'phase2' ? 'Fictional Windows evidence demo selected' : sample === 'multi' ? 'Fictional two-file demo selected' : 'Fictional sample selected'); }
      $('mapping-confirm').checked = false; $('preview').hidden = false;
      renderPreview();
      status('status', number(sources.length) + (sources.length === 1 ? ' source ready' : ' sources ready') + ' for review.');
      status('preview-status', state.data ? 'The previous results remain available until the reviewed sources are analyzed.' : 'Review each source, then confirm the event meanings.');
      $('preview-title').focus({ preventScroll: true }); scrollToElement($('preview'));
    } catch (error) {
      status('status', (error && error.message ? error.message : 'Could not read these files.') + (state.data ? ' The previous results are still available below.' : ''), true);
    } finally { setBusy(false); }
  }
  $('prepare').addEventListener('click', () => prepareFiles(false));
  $('demo').addEventListener('click', () => prepareFiles(true));
  $('demo-multi').addEventListener('click', () => prepareFiles('multi'));
  $('demo-phase2').addEventListener('click', () => prepareFiles('phase2')); 
  $('demo-top').addEventListener('click', () => prepareFiles(true));
  function mappingChanged() {
    $('mapping-confirm').checked = false; setBusy(state.busy);
    status('preview-status', 'Settings changed. Review the source mappings and confirm them again.');
  }
  $('mapping-confirm').addEventListener('change', () => setBusy(state.busy));
  function option(value, label) { const node = create('option', '', label); node.value = value; return node; }
  function previewText(value) {
    const text = String(value == null ? '' : value);
    return text.length > 160 ? text.slice(0, 160) + '… [preview shortened]' : text || '—';
  }
  function renderPreview() {
    const root = $('preview-sources'); root.replaceChildren();
    setText('preview-count', number(state.draftSources.length) + (state.draftSources.length === 1 ? ' SOURCE' : ' SOURCES'));
    state.draftSources.forEach(source => {
      const cfg = state.draftConfigs[source.id], card = create('article', 'preview-card');
      const heading = create('div', 'preview-card-heading');
      const title = create('div'); title.appendChild(create('span', 'source-id', source.id)); title.appendChild(create('strong', '', source.filename)); heading.appendChild(title);
      heading.appendChild(create('span', 'muted small', number(source.rows.length) + ' records' + ((source.artifacts || []).length ? ' · ' + number(source.artifacts.length) + ' registry keys' : ''))); card.appendChild(heading);
      card.appendChild(create('p', 'muted small', source.format || 'Prepared CSV'));
      card.appendChild(create('p', 'source-fingerprint', 'SHA-256: ' + source.sha256));
      if (source.adapter) {
        card.appendChild(create('p', 'muted small', 'Fields use the selected Windows evidence adapter. Raw or decoded source details remain in the source_record field.'));
        const contextGrid = create('div', 'zone-grid');
        const hostLabel = create('label', '', 'Host if absent from source (optional)');
        const host = create('input'); host.type = 'text'; host.value = cfg.host; host.maxLength = 255; host.addEventListener('input', () => { cfg.host = host.value; mappingChanged(); }); hostLabel.appendChild(host);
        const channelLabel = create('label', '', 'Channel if absent from event (optional)');
        const channel = create('input'); channel.type = 'text'; channel.value = cfg.channel; channel.maxLength = 255; channel.placeholder = 'e.g. Security'; channel.addEventListener('input', () => { cfg.channel = channel.value; mappingChanged(); }); channelLabel.appendChild(channel);
        contextGrid.append(hostLabel, channelLabel); card.appendChild(contextGrid);
        card.appendChild(create('p', 'muted small', 'Host and channel entries are analyst-supplied context and apply only when missing; they are used when analysis starts.'));
      } else {
      const mappingGrid = create('div', 'mapping-grid');
      P.FIELDS.forEach(field => {
        const label = create('label', '', FIELD_LABELS[field] + (P.REQUIRED.includes(field) ? ' *' : ' (optional)'));
        const select = create('select'); select.id = 'map-' + source.id + '-' + field;
        select.appendChild(option('', P.REQUIRED.includes(field) ? 'Select a column' : 'Not mapped'));
        source.headers.forEach((header, i) => select.appendChild(option(String(i), previewText(header) + ' · column ' + (i + 1))));
        select.value = Number.isInteger(cfg.mapping[field]) ? String(cfg.mapping[field]) : '';
        select.addEventListener('change', () => { cfg.mapping[field] = select.value === '' ? null : Number(select.value); mappingChanged(); });
        label.appendChild(select); mappingGrid.appendChild(label);
      });
      card.appendChild(mappingGrid);
      }
      const zoneGrid = create('div', 'zone-grid');
      const modeLabel = create('label', '', 'Timezone for timestamps without an offset');
      const mode = create('select'); mode.appendChild(option('fixed', 'Fixed UTC offset')); mode.appendChild(option('iana', 'IANA time zone')); mode.value = cfg.zone.mode; modeLabel.appendChild(mode);
      const valueLabel = create('label', '', 'Offset or IANA zone');
      const value = create('input'); value.type = 'text'; value.value = cfg.zone.value; value.spellcheck = false; value.maxLength = 120; valueLabel.appendChild(value);
      const hint = create('p', 'muted small', cfg.zone.mode === 'iana' ?
        'Example: America/New_York or Asia/Kolkata. Years 1970–2100. Ambiguous and nonexistent local times require review.' :
        'Example: +05:30. Fixed offsets do not adjust for daylight-saving changes.');
      mode.addEventListener('change', () => {
        cfg.zone.mode = mode.value; cfg.zone.value = mode.value === 'fixed' ? '+00:00' : 'UTC'; value.value = cfg.zone.value;
        hint.textContent = mode.value === 'fixed' ? 'Example: +05:30. Fixed offsets do not adjust for daylight-saving changes.' :
          'Example: America/New_York or Asia/Kolkata. Years 1970–2100. Ambiguous and nonexistent local times require review.';
        mappingChanged();
      });
      value.addEventListener('input', () => { cfg.zone.value = value.value; mappingChanged(); });
      zoneGrid.append(modeLabel, valueLabel); card.append(zoneGrid, hint);
      const tableTitle = create('p', 'preview-label', 'PREVIEW · FIRST ' + Math.min(5, source.rows.length) + ' DATA RECORDS'); card.appendChild(tableTitle);
      const wrap = create('div', 'table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Preview for ' + source.filename);
      const table = create('table', 'preview-table'), thead = create('thead'), hr = create('tr');
      hr.appendChild(create('th', '', 'RECORD'));
      source.headers.forEach((h, i) => hr.appendChild(create('th', '', previewText(h) + ' [' + (i + 1) + ']')));
      thead.appendChild(hr); table.appendChild(thead); const body = create('tbody');
      source.rows.slice(0, 5).forEach((row, i) => {
        const tr = create('tr'); cell(tr, String(i + 2));
        source.headers.forEach((_, col) => cell(tr, previewText(row[col])));
        body.appendChild(tr);
      });
      if (!source.rows.length) blankRow(body, source.headers.length + 1, 'No data records in this source.');
      table.appendChild(body); wrap.appendChild(table); card.appendChild(wrap);
      card.appendChild(create('p', 'muted small', 'Preview text may be shortened. Original column values and extra fields remain available in Data quality and exports.'));
      root.appendChild(card);
    });
  }

  $('analyze').addEventListener('click', async () => {
    if (state.busy || !$('mapping-confirm').checked) return;
    if (state.notes.length && !confirm('Analyzing a new case will discard the current in-memory notes. Export them first if needed. Continue?')) return;
    setBusy(true); status('preview-status', 'Analyzing reviewed records locally…');
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const configs = Object.fromEntries(state.draftSources.map(s => [s.id, { mapping: { ...state.draftConfigs[s.id].mapping }, zone: { ...state.draftConfigs[s.id].zone }, host:state.draftConfigs[s.id].host, channel:state.draftConfigs[s.id].channel }]));
      const reviewedSources = state.draftSources.map(s => E.materialize(s, configs[s.id]));
      const data = P.analyzeSources(reviewedSources, configs, {});
      state.caseSources = reviewedSources; state.caseConfigs = configs; state.resolutions = {}; state.data = data; state.baseline=null; state.baselineIndex=null; $('baseline-file').value=''; status('baseline-status','No list loaded. Device IDs have not been compared.'); state.notes = []; state.drill = null; $('device-detail').hidden = true; selectNoteTarget({kind:'case',label:'Case'},true); renderNotes();
      for(const id of ['search','filter-host','filter-user','filter-device','filter-start','filter-end'])$(id).value=''; $('event-type').value='all'; $('quality-filter').value='all'; $('filter-sort').value='asc'; $('display-mode').value='UTC'; $('display-zone').value='Asia/Kolkata'; $('device-group').value='host';
      state.eventPage = 0; state.devicePage = 0; state.issuePage = 0; $('results').hidden = false;
      $('quality-panel').open = data.unresolvedTimes > 0;
      renderSources(); renderQuality(); renderCrossSource(); applyFilters();
      status('preview-status', 'Analysis complete. Review any quality entries before drawing conclusions.');
      status('status', number(data.events.length) + ' accepted records; ' + number(data.skipped) + ' skipped.');
      status('export-status', ''); status('resolution-status', '');
      $('results-title').focus({ preventScroll: true }); scrollToElement($('results'));
    } catch (error) {
      status('preview-status', (error && error.message ? error.message : 'Could not analyze the selected sources.') + (state.data ? ' Previous results are unchanged.' : ''), true);
    } finally { setBusy(false); }
  });

  function renderSources() {
    const data = state.data;
    setText('source-name', number(data.sources.length) + (data.sources.length === 1 ? ' source file' : ' source files'));
    setText('source-hash', data.unresolvedTimes ? number(data.unresolvedTimes) + ' unresolved local ' + (data.unresolvedTimes === 1 ? 'time' : 'times') + ' · review Data quality' : 'Open source details below');
    setText('source-count', number(data.totalRecords) + ' SOURCE RECORDS');
    const root = $('source-list'); root.replaceChildren();
    data.sources.forEach(source => {
      const item = create('article', 'source-item');
      item.appendChild(create('strong', '', source.id + ' · ' + source.filename));
      item.appendChild(create('p', 'muted small', (source.format || 'Prepared CSV') + (source.artifactCount ? ' · ' + number(source.artifactCount) + ' registry keys' : '') + (source.context.host ? ' · analyst-supplied host: ' + source.context.host : '') + (source.context.channel ? ' · analyst-supplied channel: ' + source.context.channel : '')));
      item.appendChild(create('p', 'source-fingerprint', 'SHA-256: ' + source.sha256));
      item.appendChild(create('p', 'muted small', 'Records: ' + number(source.totalRecords) + ' · accepted: ' + number(source.accepted) + ' · skipped: ' + number(source.skipped) + ' · timezone: ' + source.zone.mode + ' ' + source.zone.value));
      const list = create('ul', 'mapping-list');
      P.FIELDS.forEach(field => {
        const m = source.mapping[field], description = m ? 'column ' + m.column + ' (' + (m.header || 'blank header') + ')' : 'not mapped';
        list.appendChild(create('li', '', FIELD_LABELS[field] + ': ' + description));
      });
      item.appendChild(list); const noteButton = create('button','button quiet record-note-button','Note this source'); noteButton.type='button'; noteButton.addEventListener('click',()=>selectNoteTarget({kind:'source',id:source.id,sha256:source.sha256,label:source.id+' · '+source.filename})); item.appendChild(noteButton); root.appendChild(item);
    });
  }
  function originalDetails(headers, values, label) {
    const details = create('details', 'original-details'), summary = create('summary', '', label || 'View original fields');
    details.appendChild(summary);
    details.addEventListener('toggle', () => {
      if (details.open && details.children.length === 1) {
        const pre = create('pre', 'original-fields', JSON.stringify({ headers, values }, null, 2)); details.appendChild(pre);
      }
    });
    return details;
  }
  function renderQuality() {
    const data = state.data;
    setText('quality-count', number(data.issues.length) + ' ENTRIES  +');
    setText('quality-summary', number(data.totalRecords) + ' source records · ' + number(data.events.length) + ' accepted · ' + number(data.skipped) + ' skipped · ' + number(data.unresolvedTimes) + ' unresolved local ' + (data.unresolvedTimes === 1 ? 'time' : 'times') + ' · ' + number(data.duplicateCandidates) + ' duplicate ' + (data.duplicateCandidates === 1 ? 'candidate' : 'candidates') + '. A record may have multiple quality entries.');
    const filter = $('quality-filter').value;
    const list = data.issues.filter(i => filter === 'all' || (filter === 'unresolved' ? i.resolved === false : i.code === filter));
    const pages = Math.max(1, Math.ceil(list.length / ISSUE_PAGE_SIZE));
    state.issuePage = Math.min(state.issuePage, pages - 1);
    const root = $('issues-list'); root.replaceChildren();
    const page = list.slice(state.issuePage * ISSUE_PAGE_SIZE, (state.issuePage + 1) * ISSUE_PAGE_SIZE);
    if (!page.length) root.appendChild(create('p', 'muted small', 'No entries in this view.'));
    page.forEach(issue => {
      const card = create('article', 'issue-card');
      const head = create('div', 'issue-head');
      head.appendChild(create('strong', '', issue.source.id + ' · record ' + issue.recordNumber + ' · ' + issue.code.replace(/_/g, ' ')));
      if (issue.resolved !== undefined) head.appendChild(create('span', issue.resolved ? 'issue-resolved' : 'issue-unresolved', issue.resolved ? 'RESOLVED' : 'SKIPPED — REVIEW'));
      card.appendChild(head);
      card.appendChild(create('p', 'muted small', issue.source.filename + ' · ' + issue.message));
      card.appendChild(originalDetails(issue.originalHeaders, issue.originalValues, 'View original source fields'));
      if (issue.code === 'ambiguous_time' && issue.candidates && issue.candidates.length > 1) {
        const label = create('label', 'resolution-label', 'Choose the evidenced occurrence');
        const select = create('select'); select.appendChild(option('', 'Select a candidate'));
        issue.candidates.forEach(candidate => select.appendChild(option(candidate.utc, candidate.utc + ' (UTC offset ' + candidate.offset + ')')));
        if (issue.chosen) select.value = issue.chosen;
        label.appendChild(select); card.appendChild(label);
        const button = create('button', 'button secondary resolution-button', 'Apply selected time'); button.type = 'button';
        button.addEventListener('click', () => {
          if (!select.value) { status('resolution-status', 'Select a candidate before applying the timestamp.', true); return; }
          updateResolution(issue.recordKey, { type: 'candidate', utc: select.value });
        });
        card.appendChild(button);
      }
      if (issue.code === 'nonexistent_time') {
        const label = create('label', 'resolution-label', 'Verified replacement timestamp with Z or an explicit offset');
        const input = create('input'); input.type = 'text'; input.placeholder = '2026-03-08T03:30:00-04:00'; input.value = issue.chosen || ''; input.spellcheck = false; label.appendChild(input); card.appendChild(label);
        card.appendChild(create('p', 'muted small', 'Use this only when independent evidence supports a corrected time. The original value is retained.'));
        const button = create('button', 'button secondary resolution-button', 'Apply verified replacement'); button.type = 'button';
        button.addEventListener('click', () => updateResolution(issue.recordKey, { type: 'override', value: input.value }));
        card.appendChild(button);
      }
      if (issue.resolved) {
        const clear = create('button', 'button quiet resolution-button', 'Clear decision'); clear.type = 'button';
        clear.addEventListener('click', () => updateResolution(issue.recordKey, null)); card.appendChild(clear);
      }
      root.appendChild(card);
    });
    pageInfo(list.length, state.issuePage, ISSUE_PAGE_SIZE, 'issues-page', 'issues-prev', 'issues-next');
  }
  function updateResolution(recordKey, resolution) {
    try {
      const decisions = { ...state.resolutions };
      if (resolution) decisions[recordKey] = resolution; else delete decisions[recordKey];
      const data = P.analyzeSources(state.caseSources, state.caseConfigs, decisions);
      state.resolutions = decisions; state.data = data;
      renderSources(); renderQuality(); renderCrossSource(); applyFilters();
      status('resolution-status', resolution ? 'Timestamp decision applied. The original source fields are retained.' : 'Decision cleared; the unresolved row is skipped again.');
    } catch (error) { status('resolution-status', error.message || 'Could not apply this timestamp decision.', true); }
  }
  $('quality-filter').addEventListener('change', () => { state.issuePage = 0; renderQuality(); });
  $('issues-prev').addEventListener('click', () => { if (state.issuePage > 0) { state.issuePage--; renderQuality(); } });
  $('issues-next').addEventListener('click', () => {
    const filter = $('quality-filter').value;
    const total = state.data.issues.filter(i => filter === 'all' || (filter === 'unresolved' ? i.resolved === false : i.code === filter)).length;
    if ((state.issuePage + 1) * ISSUE_PAGE_SIZE < total) { state.issuePage++; renderQuality(); }
  });

  function renderCrossSource() {
    state.correlations = E.correlate(state.data.events, state.caseSources);
    const result = state.correlations, root = $('correlation-list'); root.replaceChildren();
    setText('correlation-summary', number(result.pairs.length) + ' associations' + (result.truncated ? ' (limit of 500 reached; additional matches may exist)' : '') + ' · ' + number(result.conflicts.length) + ' IDs observed on different hosts (up to 100). Dataset-wide; showing the first 25 of each.');
    if (!result.pairs.length) root.appendChild(create('p', 'muted small', 'No associations found. Records without a host or full device ID are not matched.'));
    result.pairs.slice(0,25).forEach(pair => {
      const card = create('article', 'issue-card');
      card.appendChild(create('strong', '', pair.kind + ' · ' + pair.a.deviceId));
      card.appendChild(create('p', 'muted small', pair.a.source.id + ' record ' + pair.a.recordNumber + ' (' + pair.a.timestamp + ') ↔ ' + pair.b.source.id + ' record ' + pair.b.recordNumber + ' (' + pair.b.timestamp + ')'));
      card.appendChild(create('p', 'muted small', pair.reason)); root.appendChild(card);
    });
    result.conflicts.slice(0,25).forEach(pair => {
      const card = create('article', 'issue-card');
      card.appendChild(create('strong', '', pair.kind + ' · ' + pair.a.deviceId));
      card.appendChild(create('p', 'muted small', pair.a.computer + ' · ' + pair.a.source.id + ' record ' + pair.a.recordNumber + ' ↔ ' + pair.b.computer + ' · ' + pair.b.source.id + ' record ' + pair.b.recordNumber));
      card.appendChild(create('p', 'muted small', pair.reason)); root.appendChild(card);
    });
    const artifacts = state.caseSources.flatMap(source => (source.artifacts || []).map(a => ({ ...a, source })));
    $('registry-panel').hidden = artifacts.length === 0;
    const list = $('registry-list'); list.replaceChildren();
    if (artifacts.length) list.appendChild(create('p', 'muted small', number(artifacts.length) + ' keys · showing the first 50; export for the complete list.'));
    artifacts.slice(0,50).forEach(a => { const item=create('article','source-item'); item.appendChild(create('strong','',a.deviceId)); item.appendChild(create('p','muted small',a.source.id + ' · line ' + a.line + ' · host: ' + (a.computer || 'not provided'))); item.appendChild(create('p','muted small',a.keyPath)); list.appendChild(item); });
  }
  function currentFilters() { return {query:$('search').value,type:$('event-type').value,host:$('filter-host').value,user:$('filter-user').value,device:$('filter-device').value,start:$('filter-start').value,end:$('filter-end').value,sort:$('filter-sort').value}; }
  function applyFilters() {
    if (!state.data) return;
    clearTimeout(state.filterTimer); state.filterTimer = null;
    try {
      const zone = $('display-mode').value === 'UTC' ? 'UTC' : W.validateZone($('display-zone').value);
      const filters=currentFilters(), filtered = W.filter(state.data.events,filters);
      state.appliedFilters=filters; $('export-csv').disabled=false; $('export-report').disabled=false; $('export-printable').disabled=false; state.zone=zone; state.filtered=filtered; state.stats=A.summarize(filtered.slice().sort(W.compare));
      state.groups=W.groups(filtered,$('device-group').value); state.eventPage=0; state.devicePage=0; updateBaseline(); invalidateReview();
      status('filter-status','Range boundaries are UTC (start inclusive, end exclusive). Times displayed in '+zone+'; charts remain in UTC.');
      renderSummary(); renderEvents(); renderDevices(); if(state.drill) renderDrill();
    } catch(error) {$('export-csv').disabled=true; $('export-report').disabled=true; $('export-printable').disabled=true; status('filter-status',error.message+' Previous results remain visible; correct the filter before exporting.',true);}
  }
  for(const id of ['search','filter-host','filter-user','filter-device','display-zone']) $(id).addEventListener('input',()=>{clearTimeout(state.filterTimer);state.filterTimer=setTimeout(applyFilters,120);});
  for(const id of ['event-type','filter-start','filter-end','filter-sort','display-mode','device-group']) $(id).addEventListener('change',applyFilters);
  $('clear-filters').addEventListener('click',()=>{for(const id of ['search','filter-host','filter-user','filter-device','filter-start','filter-end'])$(id).value='';$('event-type').value='all';$('filter-sort').value='asc';$('display-mode').value='UTC';$('display-zone').value='Asia/Kolkata';applyFilters();});
  function renderSummary() {
    const s = state.stats;
    setText('metric-records', number(s.records)); setText('metric-connections', number(s.connections));
    setText('metric-devices', number(s.devices.length)); setText('metric-repeated', number(s.repeated));
    setText('visible-count', number(s.records) + ' MATCHING RECORDS');
    const chart = $('daily-chart'); chart.replaceChildren();
    const days = s.daily.slice(-14), max = Math.max(1, ...days.map(d => d[1])); $('chart-empty').hidden = !!days.length;
    for (const [day, count] of days) {
      const row = create('div', 'bar-row'); row.appendChild(create('span', '', day));
      const track = create('div', 'bar-track'), fill = create('div', 'bar-fill'); fill.style.width = (count / max * 100) + '%';
      track.appendChild(fill); row.appendChild(track); row.appendChild(create('span', 'bar-value', number(count))); chart.appendChild(row);
    }
    const breakdown = $('type-breakdown'); breakdown.replaceChildren();
    for (const [label, key] of [['Connected', 'connected'], ['Disconnected', 'disconnected'], ['Other', 'other']]) {
      const row = create('div', 'type-row'); row.appendChild(create('span', 'type-dot ' + key));
      row.appendChild(create('span', '', label)); row.appendChild(create('strong', '', number(s.types[key]))); breakdown.appendChild(row);
    }
  }
  function pageInfo(total, page, size, labelId, prevId, nextId) {
    const pages = Math.max(1, Math.ceil(total / size)); setText(labelId, total ? 'Page ' + (page + 1) + ' of ' + pages : 'No results');
    $(prevId).disabled = page <= 0; $(nextId).disabled = page >= pages - 1;
  }
  function renderEvents() {
    const body = $('event-rows'); body.replaceChildren();
    const page = state.filtered.slice(state.eventPage * PAGE_SIZE, (state.eventPage + 1) * PAGE_SIZE);
    if (!page.length) blankRow(body, 7, 'No records match this view.');
    page.forEach(event => {
      const row = create('tr'); cell(row, W.displayTime(event,state.zone), 'mono');
      const typeCell = create('td'), type = create('span', 'event-badge ' + event.eventType, event.eventType);
      if (event.originalEventType && event.originalEventType.toLowerCase() !== event.eventType) type.title = 'Original label: ' + event.originalEventType;
      typeCell.appendChild(type); if (event.source.format && event.source.format !== 'Prepared CSV') typeCell.appendChild(create('small', 'event-context', event.originalEventType)); row.appendChild(typeCell);
      cell(row, event.deviceId, 'mono'); cell(row, event.computer); cell(row, event.username);
      const sourceCell = create('td'); sourceCell.appendChild(create('span', '', event.source.id + ' · ' + event.source.filename));
      sourceCell.appendChild(create('small', 'event-context', event.timeBasis + (event.duplicateOf ? ' · duplicate candidate' : '')));
      sourceCell.appendChild(originalDetails(event.originalHeaders, event.originalValues)); row.appendChild(sourceCell);
      const recordCell=create('td'); recordCell.appendChild(create('span','',String(event.recordNumber))); const noteButton=create('button','button quiet record-note-button','Note record'); noteButton.type='button'; noteButton.addEventListener('click',()=>selectNoteTarget({kind:'record',id:event.recordKey,source:event.source.id,sourceSha256:event.source.sha256,record:event.recordNumber,label:event.source.id+' · record '+event.recordNumber})); recordCell.appendChild(noteButton); row.appendChild(recordCell); body.appendChild(row);
    });
    pageInfo(state.filtered.length, state.eventPage, PAGE_SIZE, 'events-page', 'events-prev', 'events-next');
  }
  function renderDevices() {
    const body=$('device-rows');body.replaceChildren();const devices=state.groups;
    const page=devices.slice(state.devicePage*DEVICE_PAGE_SIZE,(state.devicePage+1)*DEVICE_PAGE_SIZE);
    if(!page.length)blankRow(body,7,'No nonempty device IDs in this view.');
    page.forEach(device=>{const row=create('tr'),first=create('td');const button=create('button','device-link',device.deviceId);button.type='button';button.addEventListener('click',()=>openDrill(device));first.appendChild(button);if(device.host!==null)first.appendChild(create('small','event-context',device.host||'Host not provided'));row.appendChild(first);cell(row,String(device.connections));cell(row,String(device.records));cell(row,W.displayTime(device.first,state.zone),'mono');cell(row,W.displayTime(device.last,state.zone),'mono');cell(row,String(device.hosts.size));const results=state.baselineStates.get(device.key);cell(row,results?(results.size===1?[...results][0]:'mixed'):'not compared','baseline-result');body.appendChild(row);});
    pageInfo(devices.length,state.devicePage,DEVICE_PAGE_SIZE,'devices-page','devices-prev','devices-next');
  }
  function updateBaseline(){
    state.baselineStates=new Map();const counts={matched:0,'no match':0,'insufficient identifier':0,'not compared':0};
    for(const e of state.filtered){const value=R.classifyFast(e.deviceId,e.computer,state.baselineIndex);counts[value]++;if(!e.deviceId.trim())continue;const key=W.deviceKey(e.deviceId,e.computer,$('device-group').value);if(!state.baselineStates.has(key))state.baselineStates.set(key,new Set());state.baselineStates.get(key).add(value);}
    state.baselineCounts=counts;setText('baseline-summary',state.baseline?'Current filtered records: matched '+number(counts.matched)+' · no match '+number(counts['no match'])+' · insufficient identifier '+number(counts['insufficient identifier'])+'. A match only reflects the supplied list.':'No comparison is available until a list is loaded.');
  }
  $('baseline-load').addEventListener('click',async()=>{const file=$('baseline-file').files[0],caseRef=state.data;if(!file){status('baseline-status','Choose a known-device CSV first.',true);return;}try{if(file.size>R.MAX_BASELINE)throw Error('Known-device CSV exceeds 1 MiB.');status('baseline-status','Reading and fingerprinting the list locally…');const bytes=new Uint8Array(await file.arrayBuffer());const base=await R.baseline(bytes,file.name);if(state.data!==caseRef)return;state.baseline=base;state.baselineIndex=R.baselineIndex(base);updateBaseline();renderDevices();status('baseline-status',base.filename+' · '+number(base.entries.length)+' entries · SHA-256: '+base.sha256+'. The list is not proof of authorization.');}catch(error){status('baseline-status',error.message+' The previous list remains active if one was loaded.',true);}});
  $('baseline-clear').addEventListener('click',()=>{state.baseline=null;state.baselineIndex=null;$('baseline-file').value='';updateBaseline();renderDevices();status('baseline-status','No list loaded. Device IDs have not been compared.');});
  function invalidateReview(){state.review=null;state.selectedFindings.clear();state.reviewPage=0;setText('rules-status','No current review leads. Run rules after changing filters or settings.');renderReview();}
  function renderReview(){const root=$('rules-list');root.replaceChildren();const all=state.review?.findings||[];const page=all.slice(state.reviewPage*10,(state.reviewPage+1)*10);if(!page.length)root.appendChild(create('p','muted small',state.review?'No leads in the current view.':'Run the rules to review the current filtered view.'));for(const f of page){const card=create('article','issue-card'),label=create('label','finding-select'),box=create('input');box.type='checkbox';box.checked=state.selectedFindings.has(f.id);box.addEventListener('change',()=>{if(box.checked)state.selectedFindings.add(f.id);else state.selectedFindings.delete(f.id);});label.appendChild(box);label.appendChild(create('strong','',f.rule.replace(/_/g,' ')+' · '+f.event.source.id+' record '+f.event.recordNumber));card.appendChild(label);card.appendChild(create('p','muted small',f.event.timestamp+' · '+(f.event.deviceId||'No device ID')+' · '+(f.event.computer||'Host not provided')));card.appendChild(create('p','',f.why));card.appendChild(create('p','muted small','Possible benign explanation: '+f.benign));card.appendChild(originalDetails(f.event.originalHeaders,f.event.originalValues));root.appendChild(card);}pageInfo(all.length,state.reviewPage,10,'rules-page','rules-prev','rules-next');}
  for(const id of ['rule-duplicates','rule-first','rule-hours','hours-start','hours-end','hours-zone'])$(id).addEventListener('change',invalidateReview);
  $('run-rules').addEventListener('click',()=>{if(state.filterTimer)applyFilters();if($('export-csv').disabled){status('rules-status','Correct invalid timeline filters before running rules.',true);return;}try{state.review=R.review(state.filtered,{repeated:$('rule-duplicates').checked,first:$('rule-first').checked,outside:$('rule-hours').checked,start:$('hours-start').value,end:$('hours-end').value,zone:$('hours-zone').value});state.selectedFindings.clear();state.reviewPage=0;status('rules-status',number(state.review.findings.length)+' review leads'+(state.review.truncated?' · limit reached; additional leads may exist':'')+'. Select any leads to include in the printable report.');renderReview();}catch(error){invalidateReview();status('rules-status',error.message,true);}});
  $('rules-prev').addEventListener('click',()=>{if(state.reviewPage>0){state.reviewPage--;renderReview();}});
  $('rules-next').addEventListener('click',()=>{if(state.review&&(state.reviewPage+1)*10<state.review.findings.length){state.reviewPage++;renderReview();}});
  function openDrill(device){state.drill={key:device.key,mode:$('device-group').value,deviceId:device.deviceId,host:device.host};state.drillPage=0;state.artifactPage=0;$('device-detail').hidden=false;renderDrill();$('device-detail-title').focus({preventScroll:true});scrollToElement($('device-detail'));}
  function renderDrill(){if(!state.drill)return;const all=W.deviceEvents(state.data.events,state.drill.key,state.drill.mode);const hosts=new Set(all.map(e=>e.computer||'(host not provided)'));setText('device-detail-title',state.drill.deviceId);setText('device-detail-summary',(state.drill.mode==='host'?'Host: '+(state.drill.host||'not provided'):'Across hosts')+' · '+number(all.length)+' accepted records · hosts: '+[...hosts].join(', ')+' · displayed in '+state.zone);const root=$('device-detail-records');root.replaceChildren();for(const e of all.slice(state.drillPage*PAGE_SIZE,(state.drillPage+1)*PAGE_SIZE)){const card=create('article','issue-card');card.appendChild(create('strong','',W.displayTime(e,state.zone)+' · '+e.originalEventType));card.appendChild(create('p','muted small',(e.computer||'Host not provided')+' · '+e.source.id+' · '+e.source.filename+' · record '+e.recordNumber+' · SHA-256 '+e.source.sha256));card.appendChild(originalDetails(e.originalHeaders,e.originalValues));const button=create('button','button quiet record-note-button','Note record');button.type='button';button.addEventListener('click',()=>selectNoteTarget({kind:'record',id:e.recordKey,source:e.source.id,sourceSha256:e.source.sha256,record:e.recordNumber,label:e.source.id+' · record '+e.recordNumber}));card.appendChild(button);root.appendChild(card);}pageInfo(all.length,state.drillPage,PAGE_SIZE,'drill-page','drill-prev','drill-next');
    const artifacts=state.caseSources.flatMap(source=>(source.artifacts||[]).filter(a=>W.deviceKey(a.deviceId,a.computer,state.drill.mode)===state.drill.key).map(a=>({...a,source})));state.artifactPage=Math.min(state.artifactPage,Math.max(0,Math.ceil(artifacts.length/PAGE_SIZE)-1));const artRoot=$('drill-artifacts');artRoot.replaceChildren();if(!artifacts.length)artRoot.appendChild(create('p','muted small','No matching registry keys.'));for(const item of artifacts.slice(state.artifactPage*PAGE_SIZE,(state.artifactPage+1)*PAGE_SIZE)){const card=create('article','issue-card');card.appendChild(create('strong','',item.keyPath));card.appendChild(create('p','muted small',item.source.id+' · '+item.source.filename+' · line '+item.line+' · SHA-256 '+item.source.sha256+' · host: '+(item.computer||'not provided')+' · no timestamp'));artRoot.appendChild(card);}pageInfo(artifacts.length,state.artifactPage,PAGE_SIZE,'artifact-page','artifact-prev','artifact-next');} 
  $('close-device').addEventListener('click',()=>{$('device-detail').hidden=true;state.drill=null;});
  $('drill-prev').addEventListener('click',()=>{if(state.drillPage>0){state.drillPage--;renderDrill();}});
  $('drill-next').addEventListener('click',()=>{if(state.drill&&(state.drillPage+1)*PAGE_SIZE<W.deviceEvents(state.data.events,state.drill.key,state.drill.mode).length){state.drillPage++;renderDrill();}});
  $('artifact-prev').addEventListener('click',()=>{if(state.artifactPage>0){state.artifactPage--;renderDrill();}});
  $('artifact-next').addEventListener('click',()=>{state.artifactPage++;renderDrill();});
  $('note-device').addEventListener('click',()=>{if(state.drill)selectNoteTarget({kind:'device',id:state.drill.key,mode:state.drill.mode,deviceId:state.drill.deviceId,host:state.drill.host,label:state.drill.deviceId+' · '+(state.drill.mode==='host'?(state.drill.host||'host not provided'):'all hosts')});});
  function selectNoteTarget(target,silent){state.noteTarget=target;state.editingNote=null;$('note-text').value='';$('note-tags').value='';$('save-note').textContent='Save note';$('cancel-note-edit').hidden=true;setText('note-target','Target: '+target.kind+' · '+target.label);status('note-status','');if(state.data&&!silent){scrollToElement($('notes-panel'));$('note-text').focus({preventScroll:true});}}
  $('note-case').addEventListener('click',()=>selectNoteTarget({kind:'case',label:'Case'}));
  $('cancel-note-edit').addEventListener('click',()=>selectNoteTarget(state.noteTarget));
  $('save-note').addEventListener('click',()=>{try{W.saveNote(state.notes,state.noteTarget,$('note-text').value,$('note-tags').value,state.editingNote);selectNoteTarget(state.noteTarget);renderNotes();status('note-status','Analyst note saved in this tab. Export it before closing.');}catch(error){status('note-status',error.message,true);}});
  function renderNotes(){const root=$('note-list');root.replaceChildren();if(!state.notes.length){root.appendChild(create('p','muted small','No analyst notes yet.'));return;}state.notes.forEach(note=>{const latest=note.versions[note.versions.length-1],card=create('article','issue-card');card.appendChild(create('strong','',note.id+' · '+note.target.kind+' · '+note.target.label));card.appendChild(create('p','muted small','Last edited: '+latest.at+' · Tags: '+(latest.tags.join(', ')||'none')));card.appendChild(create('p','',latest.text));const edit=create('button','button quiet','Edit note');edit.type='button';edit.addEventListener('click',()=>{state.noteTarget=note.target;state.editingNote=note.id;setText('note-target','Editing '+note.id+' · '+note.target.label);$('note-text').value=latest.text;$('note-tags').value=latest.tags.join(', ');$('save-note').textContent='Save revision';$('cancel-note-edit').hidden=false;$('note-text').focus();});card.appendChild(edit);const history=create('details','note-history'),summary=create('summary','muted small','Edit history ('+note.versions.length+' versions)');history.appendChild(summary);note.versions.forEach((v,i)=>history.appendChild(create('pre','original-fields',(i+1)+' · '+v.at+' · tags: '+(v.tags.join(', ')||'none')+'\n'+v.text)));card.appendChild(history);root.appendChild(card);});}
  $('export-notes').addEventListener('click',()=>download('usb-analyst-notes.json',W.notesExport(state.notes,state.caseSources),'application/json;charset=utf-8'));
  window.addEventListener('beforeunload',event=>{if(state.notes.length){event.preventDefault();event.returnValue='';}});
  $('events-prev').addEventListener('click', () => { if (state.eventPage > 0) { state.eventPage--; renderEvents(); } });
  $('events-next').addEventListener('click', () => { if ((state.eventPage + 1) * PAGE_SIZE < state.filtered.length) { state.eventPage++; renderEvents(); } });
  $('devices-prev').addEventListener('click', () => { if (state.devicePage > 0) { state.devicePage--; renderDevices(); } });
  $('devices-next').addEventListener('click', () => { if ((state.devicePage + 1) * DEVICE_PAGE_SIZE < state.groups.length) { state.devicePage++; renderDevices(); } });

  function download(name, contents, mime) {
    try {
      const url = URL.createObjectURL(new Blob(Array.isArray(contents) ? contents : [contents], { type: mime })), link = create('a');
      link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('export-status', 'Download started. Save exports separately from the original evidence.');
    } catch (error) { status('export-status', error.message || 'Could not start the download.', true); }
  }
  $('export-csv').addEventListener('click', () => {
    if (state.filterTimer) applyFilters();
    download('usb-activity-filtered.csv', P.exportEventsCSVChunks(state.data, state.filtered), 'text/csv;charset=utf-8');
  });
  $('export-correlations').addEventListener('click', () => download('usb-source-associations.csv', E.exportCorrelations(state.correlations), 'text/csv;charset=utf-8'));
  $('export-registry').addEventListener('click', () => download('usb-registry-keys.csv', E.exportArtifacts(state.caseSources), 'text/csv;charset=utf-8'));
  $('export-printable').addEventListener('click',()=>{if(state.filterTimer)applyFilters();if($('export-printable').disabled)return;try{const html=R.report({data:state.data,filters:state.appliedFilters,zone:state.zone,notes:state.notes,base:state.baseline,baselineCounts:state.baselineCounts,reviewResult:state.review,selected:state.selectedFindings,correlations:state.correlations});download('usb-investigation-report.html',html,'text/html;charset=utf-8');}catch(error){status('export-status',error.message,true);}});
  $('export-issues').addEventListener('click', () => download('usb-activity-quality.csv', P.exportIssuesCSVChunks(state.data), 'text/csv;charset=utf-8'));
  $('export-report').addEventListener('click', () => {
    if (state.filterTimer) applyFilters();
    download('usb-activity-triage-report.txt', P.reportText(state.data, state.filtered.slice().sort(W.compare), $('search').value.trim(), $('event-type').value) + '\nADDITIONAL FILTERS AND DISPLAY\n' + JSON.stringify({...state.appliedFilters,displayZone:state.zone}) + '\nAnalyst notes are separate; export the notes and edit history independently.\n\nCROSS-SOURCE REVIEW\n' + state.correlations.pairs.length + ' candidate associations' + (state.correlations.truncated ? ' (maximum reached; more may exist)' : '') + '. Export associations for details.\nRegistry keys: ' + state.caseSources.reduce((n,s) => n + (s.artifacts || []).length, 0) + '. Registry key exports have no connection timestamp.\n', 'text/plain;charset=utf-8');
  });
  $('clear-case').addEventListener('click', () => {
    if(state.notes.length && !confirm('Clearing the case will discard its in-memory analyst notes. Export them first if needed. Continue?'))return;
    state.notes=[];state.baseline=null;state.baselineIndex=null;state.review=null;state.selectedFindings.clear();$('baseline-file').value='';state.drill=null;$('device-detail').hidden=true;
    clearTimeout(state.filterTimer); state.data = null; state.files = []; state.caseSources = []; state.caseConfigs = {}; state.resolutions = {};
    state.filtered = []; state.stats = null; resetDraft(); $('file-input').value = ''; $('search').value = ''; $('event-type').value = 'all';
    $('results').hidden = true; setText('file-label', 'No files selected'); status('status', 'Case cleared from this tab. Choose evidence files or load the sample.');
    setBusy(false); scrollToElement($('workspace-title'));
  });
})();
