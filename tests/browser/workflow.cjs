'use strict';
// Browser integration checks run in CI with a locally served copy of the app.
const {chromium,firefox}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const contentTypes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.csv':'text/csv','.xml':'application/xml'};
async function run(){
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream'}).end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const name=process.env.BROWSER||'chromium',engine={chromium,firefox}[name];if(!engine)throw Error('Unknown browser '+name);
  const browser=await engine.launch(name==='firefox'?{headless:true,firefoxUserPrefs:{'accessibility.tabfocus':7}}:{headless:true});try{
   const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link');await page.setViewportSize({width:375,height:812});assert.equal(await page.locator('.topnav a').first().isVisible(),true);await page.setViewportSize({width:1100,height:800});
   await page.click('#demo-phase2');await page.waitForSelector('#preview:not([hidden])');assert.match(await page.locator('#preview-count').innerText(),/3 SOURCES/);
   await page.check('#mapping-confirm');await page.click('#analyze');await page.waitForSelector('#results:not([hidden])');assert.equal(await page.locator('#metric-records').innerText(),'3');
   const list=Buffer.from('device_id,computer\nUSBSTOR\\Disk&Ven_Demo&Prod_Storage\\DEMO001,LAB-PC-01\n');await page.locator('#baseline-file').setInputFiles({name:'known.csv',mimeType:'text/csv',buffer:list});await page.click('#baseline-load');await page.waitForFunction(()=>document.querySelector('#baseline-status').textContent.includes('SHA-256'));await page.locator('#note-text').fill('Fictional analyst note');await page.click('#save-note');await page.click('#run-rules');
   const [download]=await Promise.all([page.waitForEvent('download'),page.click('#case-save')]);const casePath=await download.path();assert.ok(casePath);
   const restored=await browser.newPage();await restored.goto(origin);await restored.locator('#case-file').setInputFiles(casePath);await restored.locator('#case-evidence').setInputFiles(['phase2-windows-events.csv','phase2-setupapi.log','phase2-usbstor.reg'].map(x=>path.join(root,'samples',x)));await restored.locator('#case-baseline').setInputFiles({name:'known.csv',mimeType:'text/csv',buffer:list});await restored.click('#case-open');await restored.waitForSelector('#results:not([hidden])');assert.match(await restored.locator('#note-list').innerText(),/Fictional analyst note/);assert.match(await restored.locator('#baseline-status').innerText(),/Original list verified/);
   await restored.locator('#file-input').setInputFiles(path.join(root,'samples/phase2-event.xml'));await restored.click('#prepare');await restored.waitForSelector('#preview:not([hidden])');assert.match(await restored.locator('#preview-sources').innerText(),/Windows Event XML/);
   const large='timestamp,event_type,device_id\n'+Array.from({length:100000},(_,i)=>`2026-01-01T00:00:00Z,connected,ID-${i}-`+'X'.repeat(80)).join('\n');await restored.locator('#file-input').setInputFiles({name:'large.csv',mimeType:'text/csv',buffer:Buffer.from(large)});await restored.click('#prepare');await restored.click('#cancel-import');await restored.waitForFunction(()=>document.querySelector('#status').textContent.includes('Import cancelled.'));assert.equal(await restored.locator('#metric-records').innerText(),'3');
   assert.deepEqual(errors,[]);console.log(`${name}: demo, keyboard, case restore, XML and cancellation passed`);
  }finally{await browser.close();}
 }finally{await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
