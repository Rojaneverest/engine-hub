// Downloads the Atlas photos listed in app/atlas/photos.json from Wikimedia Commons (1,600 px wide), converts
// them to WebP in app/atlas/img/, and records author, licence and source in app/atlas/credits.json.
// Re-run after editing photos.json. Requires network access and Python with Pillow (for WebP encoding).
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const UA = 'EngineLabAtlas/1.0 (https://github.com/Rojaneverest/engine-hub)';
const photos = JSON.parse(fs.readFileSync('app/atlas/photos.json', 'utf8'));
const strip = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
const credits = {};
for (const [id, file] of Object.entries(photos)) {
  const q = new URLSearchParams({ action: 'query', format: 'json', titles: file, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1600' });
  const page = Object.values((await (await fetch('https://commons.wikimedia.org/w/api.php?' + q, { headers: { 'User-Agent': UA } })).json()).query.pages)[0];
  const ii = page.imageinfo[0], m = ii.extmetadata;
  const jpg = `app/atlas/img/${id}.src`, webp = `app/atlas/img/${id}.webp`;
  fs.writeFileSync(jpg, Buffer.from(await (await fetch(ii.thumburl, { headers: { 'User-Agent': UA } })).arrayBuffer()));
  execFileSync('python3', ['-c', `from PIL import Image,ImageOps;im=ImageOps.exif_transpose(Image.open('${jpg}')).convert('RGB');im.thumbnail((1600,1600));im.save('${webp}','WEBP',quality=80,method=6);print(im.size[0],im.size[1])`]);
  fs.unlinkSync(jpg);
  const [w, h] = execFileSync('python3', ['-c', `from PIL import Image;print(*Image.open('${webp}').size)`]).toString().trim().split(' ').map(Number);
  credits[id] = { file, author: strip(m.Artist?.value) || 'Unknown author', license: strip(m.LicenseShortName?.value), licenseUrl: m.LicenseUrl?.value || '', source: ii.descriptionurl, width: w, height: h };
  console.log(id.padEnd(16), credits[id].license.padEnd(14), credits[id].author.slice(0, 50));
}
fs.writeFileSync('app/atlas/credits.json', JSON.stringify(credits, null, 1) + '\n');
