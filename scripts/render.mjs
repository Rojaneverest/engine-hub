/* Render the film, a single shot, or stills — deterministic, frame by frame.
   npm run render -- --shot slider-crank        one shot (1080p)
   npm run render -- --shot apart --preview     fast half-resolution preview
   npm run render -- --all                      the whole pilot (+ soft subtitles)
   npm run render -- --still 420                a single PNG frame of the pilot
   Env: RENDER_CONCURRENCY (default: CPU count), RENDER_GL (angle|swangle|swiftshader), REMOTION_BROWSER (path). */
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';
import { execFileSync } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path';

const argv = process.argv.slice(2); const flag = n => argv.includes('--' + n); const val = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
async function browser() {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  if (process.platform === 'linux') { try { const c = (await import('@sparticuz/chromium')).default; return await c.executablePath(); } catch { return null; } }
  return null; // macOS/Windows: Remotion downloads/uses its own headless Chrome
}
const exe = await browser(); const gl = process.env.RENDER_GL || (exe ? 'swangle' : 'angle');
const concurrency = Number(process.env.RENDER_CONCURRENCY || Math.max(1, os.cpus().length - 1));
fs.mkdirSync('out', { recursive: true });
console.log('bundling…');
const serveUrl = await bundle({ entryPoint: path.resolve('video/index.ts'), publicDir: path.resolve('public') });
const common = { serveUrl, browserExecutable: exe ?? undefined, chromiumOptions: { gl, disableWebSecurity: true }, timeoutInMilliseconds: 120000 };
const pick = async id => selectComposition({ ...common, id, inputProps: {} });

if (val('still') != null) {
  const comp = await pick(val('comp') || 'Pilot'); const frames = val('still').split(',').map(Number);
  for (const f of frames) { const o = `out/still-${String(f).padStart(5, '0')}.png`; await renderStill({ ...common, composition: comp, frame: f, output: o, scale: flag('preview') ? .5 : 1 }); console.log(o); }
  process.exit(0);
}
const id = flag('all') ? (flag('captions') ? 'Pilot-captioned' : 'Pilot') : val('shot') ? 'shot-' + val('shot') : null;
if (!id) { console.error('Use --all, --shot <id> or --still <frame>'); process.exit(1); }
const comp = await pick(id); const preview = flag('preview');
const out = `out/${id}${preview ? '-preview' : ''}.mp4`; const t0 = Date.now(); let last = 0;
await renderMedia({ ...common, composition: comp, codec: 'h264', outputLocation: out, concurrency, scale: preview ? .5 : 1,
  crf: preview ? 28 : 18, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: preview ? 80 : 94, x264Preset: preview ? 'veryfast' : 'slow',
  onProgress: ({ progress }) => { if (progress - last >= .05 || progress === 1) { last = progress; console.log(`${id}: ${(progress * 100).toFixed(0)}%  (${((Date.now() - t0) / 1000).toFixed(0)} s)`); } } });
// attach the caption track as soft subtitles for the full film
if (flag('all') && fs.existsSync('out/captions.srt')) {
  const tmp = out.replace('.mp4', '.subs.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-i', 'out/captions.srt', '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', tmp]);
  fs.renameSync(tmp, out);
}
console.log('wrote', out, `in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
