(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const A = window.USBAnalysis;
  const state = { data: null, file: null, filtered: [], stats: null, eventPage: 0, devicePage: 0, busy: false, filterTimer: null };
  const PAGE_SIZE = 20, DEVICE_PAGE_SIZE = 10;
  const number = value => new Intl.NumberFormat().format(value);
  const setText = (id, value) => { $(id).textContent = String(value); };
  function status(id, message, error) { setText(id, message); $(id).classList.toggle('error', !!error); }
  function create(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }
  function cell(row, value, className) { row.appendChild(create('td', className || '', value || '—')); }
  function blankRow(body, cols, message) {
    const tr = create('tr'); const td = create('td', 'empty-row', message); td.colSpan = cols; tr.appendChild(td); body.appendChild(tr);
  }
  function setBusy(busy) {
    state.busy = busy;
    $('analyze').disabled = busy || !state.file;
    $('demo').disabled = busy; $('demo-top').disabled = busy; $('file-input').disabled = busy;
  }
  function chooseFile(file) {
    if (state.busy || !file) return;
    if (!/\.csv$/i.test(file.name)) { status('status', 'Choose a prepared CSV file with a .csv extension.', true); return; }
    if (file.size > A.MAX_BYTES) { status('status', 'The file exceeds the 20 MiB input limit.', true); return; }
    state.file = file;
    setText('file-label', file.name + ' · ' + number(file.size) + ' bytes');
    status('status', 'File selected. Check the UTC offset, then analyze the records.');
    $('analyze').disabled = false;
  }
  $('file-input').addEventListener('change', event => chooseFile(event.target.files[0]));
  const drop = $('drop-zone');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); if (!state.busy) drop.classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', event => {
    if (event.dataTransfer.files.length !== 1) { status('status', 'Choose exactly one CSV at a time.', true); return; }
    chooseFile(event.dataTransfer.files[0]);
  });

  async function analyze(sample) {
    if (state.busy || (!sample && !state.file)) return;
    try { A.parseOffset($('offset').value); }
    catch (error) { status('status', error.message, true); $('offset').focus(); return; }
    setBusy(true);
    status('status', sample ? 'Opening the fictional sample…' : 'Reading and analyzing your CSV locally…');
    try {
      // Allow the status to paint before processing a large file.
      await new Promise(resolve => requestAnimationFrame(resolve));
      const bytes = sample ? new TextEncoder().encode(window.USB_SAMPLE_CSV) : new Uint8Array(await state.file.arrayBuffer());
      const name = sample ? 'fictional_usb_activity.csv (sample)' : state.file.name;
      const data = await A.loadBytes(bytes, name, $('offset').value);
      state.data = data;
      $('search').value = ''; $('event-type').value = 'all';
      state.eventPage = 0; state.devicePage = 0;
      $('results').hidden = false;
      setText('source-name', data.filename); setText('source-hash', data.sha256);
      setText('source-count', `${number(data.totalRecords)} SOURCE RECORDS`);
      renderQuality(); applyFilters();
      status('status', `Loaded ${number(data.events.length)} valid records; ${number(data.issues.length)} skipped.`);
      status('export-status', '');
      $('results-title').focus({ preventScroll: true });
      $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (error) {
      status('status', (error && error.message ? error.message : 'Could not read this file.') + (state.data ? ' The previous results are still available below.' : ''), true);
    } finally { setBusy(false); }
  }
  $('analyze').addEventListener('click', () => analyze(false));
  $('demo').addEventListener('click', () => analyze(true));
  $('demo-top').addEventListener('click', () => analyze(true));

  function renderQuality() {
    const data = state.data;
    const missing = data.events.filter(e => !e.deviceId).length;
    setText('quality-count', `${number(data.issues.length)} SKIPPED  +`);
    setText('quality-summary', `${number(data.totalRecords)} source records; ${number(data.events.length)} accepted; ${number(data.issues.length)} skipped. ${number(missing)} accepted records have no device ID. ${number(data.naiveTimestamps)} timestamps had no offset and used ${data.assumedOffset}.`);
    const list = $('issues-list'); list.replaceChildren();
    if (!data.issues.length) list.appendChild(create('li', '', 'No rows were skipped.'));
    else {
      data.issues.slice(0, 50).forEach(issue => list.appendChild(create('li', '', issue)));
      if (data.issues.length > 50) list.appendChild(create('li', '', `Showing the first 50 of ${number(data.issues.length)} issues.`));
    }
  }

  function applyFilters() {
    if (!state.data) return;
    clearTimeout(state.filterTimer); state.filterTimer = null;
    state.filtered = A.filterEvents(state.data.events, $('search').value, $('event-type').value);
    state.stats = A.summarize(state.filtered);
    state.eventPage = 0; state.devicePage = 0;
    renderSummary(); renderEvents(); renderDevices();
  }
  $('search').addEventListener('input', () => { clearTimeout(state.filterTimer); state.filterTimer = setTimeout(applyFilters, 120); });
  $('event-type').addEventListener('change', applyFilters);
  $('clear-filters').addEventListener('click', () => { $('search').value = ''; $('event-type').value = 'all'; applyFilters(); });

  function renderSummary() {
    const s = state.stats;
    setText('metric-records', number(s.records)); setText('metric-connections', number(s.connections));
    setText('metric-devices', number(s.devices.length)); setText('metric-repeated', number(s.repeated));
    setText('visible-count', `${number(s.records)} MATCHING RECORDS`);
    const chart = $('daily-chart'); chart.replaceChildren();
    const days = s.daily.slice(-14), max = Math.max(1, ...days.map(d => d[1]));
    $('chart-empty').hidden = !!days.length;
    for (const [day, count] of days) {
      const row = create('div', 'bar-row');
      row.appendChild(create('span', '', day));
      const track = create('div', 'bar-track'), fill = create('div', 'bar-fill');
      fill.style.width = (count / max * 100) + '%'; track.appendChild(fill); row.appendChild(track);
      row.appendChild(create('span', 'bar-value', number(count))); chart.appendChild(row);
    }
    const breakdown = $('type-breakdown'); breakdown.replaceChildren();
    for (const [label, key] of [['Connected', 'connected'], ['Disconnected', 'disconnected'], ['Other', 'other']]) {
      const row = create('div', 'type-row'); row.appendChild(create('span', 'type-dot ' + key));
      row.appendChild(create('span', '', label)); row.appendChild(create('strong', '', number(s.types[key]))); breakdown.appendChild(row);
    }
  }
  function pageInfo(total, page, size, labelId, prevId, nextId) {
    const pages = Math.max(1, Math.ceil(total / size));
    setText(labelId, total ? `Page ${page + 1} of ${pages}` : 'No results');
    $(prevId).disabled = page <= 0; $(nextId).disabled = page >= pages - 1;
  }
  function renderEvents() {
    const body = $('event-rows'); body.replaceChildren();
    const page = state.filtered.slice(state.eventPage * PAGE_SIZE, (state.eventPage + 1) * PAGE_SIZE);
    if (!page.length) blankRow(body, 6, 'No records match this view.');
    page.forEach(event => {
      const row = create('tr'); cell(row, event.timestamp, 'mono');
      const typeCell = create('td'), type = create('span', 'event-badge ' + event.eventType, event.eventType);
      if (event.originalEventType && event.originalEventType.toLowerCase() !== event.eventType) type.title = 'Original label: ' + event.originalEventType;
      typeCell.appendChild(type); row.appendChild(typeCell);
      cell(row, event.deviceId, 'mono'); cell(row, event.computer); cell(row, event.username); cell(row, String(event.recordNumber)); body.appendChild(row);
    });
    pageInfo(state.filtered.length, state.eventPage, PAGE_SIZE, 'events-page', 'events-prev', 'events-next');
  }
  function renderDevices() {
    const body = $('device-rows'); body.replaceChildren(); const devices = state.stats.devices;
    const page = devices.slice(state.devicePage * DEVICE_PAGE_SIZE, (state.devicePage + 1) * DEVICE_PAGE_SIZE);
    if (!page.length) blankRow(body, 6, 'No nonempty device IDs in this view.');
    page.forEach(device => {
      const row = create('tr'); cell(row, device.deviceId, 'mono'); cell(row, String(device.connections)); cell(row, String(device.records));
      cell(row, device.firstSeen, 'mono'); cell(row, device.lastSeen, 'mono'); cell(row, String(device.computers)); body.appendChild(row);
    });
    pageInfo(devices.length, state.devicePage, DEVICE_PAGE_SIZE, 'devices-page', 'devices-prev', 'devices-next');
  }
  $('events-prev').addEventListener('click', () => { if (state.eventPage > 0) { state.eventPage--; renderEvents(); } });
  $('events-next').addEventListener('click', () => { if ((state.eventPage + 1) * PAGE_SIZE < state.filtered.length) { state.eventPage++; renderEvents(); } });
  $('devices-prev').addEventListener('click', () => { if (state.devicePage > 0) { state.devicePage--; renderDevices(); } });
  $('devices-next').addEventListener('click', () => { if ((state.devicePage + 1) * DEVICE_PAGE_SIZE < state.stats.devices.length) { state.devicePage++; renderDevices(); } });

  function download(name, contents, mime) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const link = create('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('export-status', 'Download started. Save exports separately from the original evidence.');
  }
  $('export-csv').addEventListener('click', () => {
    if (state.filterTimer) applyFilters();
    download('usb-activity-filtered.csv', A.exportCSV(state.data, state.filtered), 'text/csv;charset=utf-8');
  });
  $('export-report').addEventListener('click', () => {
    if (state.filterTimer) applyFilters();
    download('usb-activity-triage-report.txt', A.reportText(state.data, state.filtered, $('search').value.trim(), $('event-type').value), 'text/plain;charset=utf-8');
  });
  $('clear-case').addEventListener('click', () => {
    clearTimeout(state.filterTimer); state.data = null; state.file = null; state.filtered = []; state.stats = null;
    $('file-input').value = ''; $('search').value = ''; $('event-type').value = 'all'; $('results').hidden = true;
    setText('file-label', 'No file selected'); status('status', 'Case cleared from this tab. Choose a CSV or load the sample.');
    $('analyze').disabled = true; $('workspace-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
