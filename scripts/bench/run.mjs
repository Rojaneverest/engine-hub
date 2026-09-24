import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core'; import fs from 'fs';
const code=fs.readFileSync('/tmp/bench/b.js','utf8');
const b=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
for(const sh of [0,1]){ const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
 await p.setContent(`<body style="margin:0"></body>`); await p.evaluate(`window.SHADOW=${sh}`); await p.addScriptTag({content:code});
 const ms=await p.evaluate(()=>{ window.go(2); return window.go(5); });
 console.log('shadows',sh,'ms/frame',ms.toFixed(0)); if(sh) await p.screenshot({path:'/tmp/bench/s.png'}); await p.close(); }
await b.close();
