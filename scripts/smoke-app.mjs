import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core'; import path from 'path';
const b = await puppeteer.launch({executablePath: await chromium.executablePath(), args:[...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], headless:true});
const p = await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.setViewport({width:1280,height:800});
await p.goto('file://'+path.resolve('dist/engine-lab.html')); await new Promise(r=>setTimeout(r,2500));
await p.click('#startFree'); await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'/tmp/app1.png'});
for(const a of ['i4','v8','flat6']){ await p.click(`[data-arch="${a}"]`); await new Promise(r=>setTimeout(r,800)); }
await p.click('[data-view="cutaway"]'); await p.click('#flowsBtn'); await p.click('[data-flow="air"]'); await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'/tmp/app2.png'});
await p.click('[data-flow="off"]'); await p.click('#explodeBtn'); await new Promise(r=>setTimeout(r,2500)); await p.screenshot({path:'/tmp/app3.png'});
console.log('errors:', errs.length? errs.slice(0,5): 'none'); await b.close();
