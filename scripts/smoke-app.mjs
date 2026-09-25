// Optional browser QA. Run only against an explicitly authorized app URL.
// ENGINE_LAB_BROWSER may point to an installed desktop browser (desktop flags, GPU on);
// otherwise the bundled serverless Chromium is used with its own flags.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const url=process.env.ENGINE_LAB_URL;
if(!url)throw Error('Set ENGINE_LAB_URL to an authorized app URL before running browser QA.');
const out=process.env.ENGINE_LAB_SCREENSHOTS||'/tmp/engine-lab-qa';
await fs.mkdir(out,{recursive:true});
const desktop=process.env.ENGINE_LAB_BROWSER;
const browser=await puppeteer.launch({executablePath:desktop||await chromium.executablePath(),args:desktop?['--enable-gpu','--ignore-gpu-blocklist']:chromium.args,headless:true});
const errors=[];
try {
 const p=await browser.newPage();p.on('pageerror',e=>errors.push(String(e)));
 const shot=n=>p.screenshot({path:path.join(out,n+'.png')});
 await p.goto(url,{waitUntil:'networkidle0'});await p.evaluate(()=>localStorage.clear());await p.reload({waitUntil:'networkidle0'});
 await p.click('[data-tab="engine"]');
 assert.equal(await p.$('.engine-unavailable'),null,'WebGL renderer failed');
 for(const [width,height] of [[1440,900],[1280,800],[1180,760]]){
  await p.setViewport({width,height});
  for(const theme of ['light','dark']){
   await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await shot(`${width}-${height}-${theme}`);
   const layout=await p.evaluate(()=>{const r=q=>document.querySelector(q).getBoundingClientRect(),a=r('#stage'),b=r('#engineInspector'),h=document.querySelector('#engineSceneHeader');
     return {overlap:Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,clipped:h.scrollWidth>h.clientWidth};});
   assert.equal(layout.overlap,false,'Stage overlaps inspector');assert.equal(layout.clipped,false,'Toolbar clips its controls');
  }
 }
 await p.setViewport({width:1440,height:900});await p.evaluate(()=>document.documentElement.dataset.theme='light');
 await p.click('[data-meet="piston"]');await shot('part-detail');
 await p.click('[data-inspector="flow"]');await p.click('[data-flow="air"]');await p.click('#sceneExplode');await p.waitForSelector('#reassembleFlow');
 assert.ok(await p.$('[data-chip="flow"]'),'Showing row lists the flow');await shot('state-row');
 await p.click('#clearAll');assert.equal(await p.$eval('#sceneState',e=>e.hidden),true,'Clear all empties the Showing row');
 await p.click('[data-inspector="charts"]');await p.click('[data-graph="torque"]');await p.click('[data-event="360"]');await shot('charts');
 await p.click('#pathButton');await shot('path-menu');await p.click('[data-path-step="cam"]');
 await p.click('[data-prediction="0"]');await p.click('#beginExplore');
 for(const a of [0,360,719])await p.click(`[data-event="${a}"]`);
 assert.equal(await p.$eval('#explainLesson',b=>b.disabled),false);await p.click('#explainLesson');await shot('lesson-result');
 await p.click('[data-tab="discover"]');await shot('discover');
 await p.click('[data-tab="engine"]');await p.click('#soundToggle');await p.waitForFunction(()=>document.querySelector('#soundToggle').getAttribute('aria-pressed')==='true'||/not available/.test(document.querySelector('#engineSceneStatus').textContent));
 await p.evaluate(()=>{const r=document.querySelector('#engineRpm');r.value=17;r.dispatchEvent(new Event('input',{bubbles:true}));});if(await p.$eval('#soundSyncNote',n=>n.hidden))throw Error('real-speed note missing');await p.click('#soundMenu summary');await shot('sound');await p.click('#soundToggle');
 await p.click('[data-tab="atlas"]');await p.click('[data-story="v8"]');await p.waitForSelector('#storyTitle');
 assert.equal(await p.$$eval('#atlas img',ims=>ims.filter(i=>i.loading!=='lazy'&&!(i.complete&&i.naturalWidth)).length),0,'Atlas images load');await shot('atlas-v8');
 assert.deepEqual(errors,[]);console.log(`Browser smoke passed. Screenshots: ${out}`);
} finally {await browser.close();}
