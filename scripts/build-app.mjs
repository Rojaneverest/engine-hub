// Builds the interactive app into one self-contained HTML file from the shared core.
import { build } from 'esbuild'; import fs from 'fs';
const parts = ['app/prelude.js','app/ui.js','app/lab.js','app/discovery.js','app/engine-page.js','app/audio.js','app/atlas.js','app/bootstrap.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
fs.mkdirSync('app/.build',{recursive:true}); fs.writeFileSync('app/.build/entry.js', parts);
const r = await build({ entryPoints:['app/.build/entry.js'], bundle:true, format:'iife', write:false, target:'es2020', minify:true, legalComments:'none' });
const js = r.outputFiles[0].text.replace(/<\/script/g,'<\\/script');
const html = fs.readFileSync('app/index.html','utf8');
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/engine-lab.html', html.replace('/* DISCOVERY_STYLES */', fs.readFileSync('app/discovery.css','utf8') + '\n' + fs.readFileSync('app/engine-page.css','utf8') + '\n' + fs.readFileSync('app/atlas.css','utf8')) + '<script>' + js + '</script>\n</body></html>');
console.log('dist/engine-lab.html', (fs.statSync('dist/engine-lab.html').size/1024).toFixed(0)+' KB');
// Atlas images sit next to the page (dist/atlas/...), referenced by relative paths.
for (const dir of ['img','render']) fs.cpSync('app/atlas/'+dir, 'dist/atlas/'+dir, { recursive: true });
