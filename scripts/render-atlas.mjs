// Renders the Atlas illustrations from the app's own 3D model: for each layout a cutaway hero and an exploded
// figure, in light and dark ink, on a transparent background. Output: app/atlas/render/<layout>-<kind>-<theme>.webp
// Usage: npm run build:app && ENGINE_LAB_BROWSER="/path/to/Chrome" node scripts/render-atlas.mjs
import puppeteer from 'puppeteer-core'; import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const browserPath = process.env.ENGINE_LAB_BROWSER;
if (!browserPath) throw Error('Set ENGINE_LAB_BROWSER to a local Chrome or Chromium executable.');
const out = 'app/atlas/render'; fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  const p = await browser.newPage(); await p.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1.5 });
  await p.goto('file://' + process.cwd() + '/dist/engine-lab.html'); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('[data-tab="engine"]'); await p.click('#sceneLabels'); await p.click('#focusView');
  await p.addStyleTag({ content: 'html,body,.app,.view,#engineView,#stage{background:transparent!important}#sceneState,#cameraControls,#engineLabels,#tip,#engineSceneStatus,#exitFocus,#transport{display:none!important}' });
  for (const arch of ['single', 'i4', 'i6', 'v6', 'v8', 'flat6']) {
    for (const theme of ['light', 'dark']) {
      await p.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await p.select('#sceneArchitecture', arch);
      for (const [kind, view, explode] of [['hero', 'cutaway', false], ['exploded', 'full', true]]) {
        await p.evaluate((view, explode) => { document.querySelector(`[data-view="${view}"]`).click();
          const b = document.querySelector('#sceneExplode'); if ((b.getAttribute('aria-pressed') === 'true') !== explode) b.click(); }, view, explode);
        // Fit frames the assembled engine; zoom out so exploded layers (and a margin) stay in frame.
        await p.evaluate(zoom => { document.querySelector('#fitEngine').click(); document.querySelector('#gl').dispatchEvent(new WheelEvent('wheel', { deltaY: zoom, bubbles: true, cancelable: true })); }, explode ? 420 : 160);
        await wait(1800);
        const png = `${out}/${arch}-${kind}-${theme}.png`;
        // Capture; while the drawing touches the frame edge, zoom out a step and capture again. The crop re-centres it.
        for (let attempt = 0; ; attempt++) {
          await (await p.$('#stage')).screenshot({ path: png, omitBackground: true });
          const fits = execFileSync('python3', ['-c', `from PIL import Image
im=Image.open('${png}').convert('RGBA');b=im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
print(int(b[0]>2 and b[1]>2 and b[2]<im.width-2 and b[3]<im.height-2))`]).toString().trim() === '1';
          if (fits) break;
          if (attempt === 5) throw Error(`${arch} ${kind}: still touching the frame edge after zooming out`);
          await p.evaluate(() => document.querySelector('#gl').dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }))); await wait(1200);
        }
        execFileSync('python3', ['-c', `from PIL import Image
im=Image.open('${png}').convert('RGBA');b=im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox();p=24
im=im.crop((max(0,b[0]-p),max(0,b[1]-p),min(im.width,b[2]+p),min(im.height,b[3]+p)));im.thumbnail((1200,1200))
im.save('${png.replace('.png', '.webp')}','WEBP',quality=82,method=6)`]);
        fs.unlinkSync(png); console.log(arch, kind, theme);
      }
    }
  }
} finally { await browser.close(); }
