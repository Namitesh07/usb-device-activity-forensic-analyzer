/* Runs supported imports locally in a dedicated worker. XML uses the page's DOM parser. */
'use strict';
importScripts('analysis.js','phase1.js','phase2.js');
self.onmessage = async event => {
  const { bytes, name, id } = event.data;
  try {
    const source = await self.USBPhase2.prepareInput(new Uint8Array(bytes), name, id);
    self.postMessage({ ok:true, source });
  } catch (error) {
    self.postMessage({ ok:false, error:error && error.message ? error.message : 'Could not parse this file.' });
  }
};
