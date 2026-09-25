/* =====================================================================
   ATLAS
   Magazine features about each engine layout: our own renders, freely licensed photographs (credited on the
   page), a sourced history timeline and the machines that made each layout famous. Content lives in
   app/atlas/content.js; engineering facts come from the shared ARCHS content. Links: #atlas, #atlas/<story>.
   ===================================================================== */
import { ATLAS, ATLAS_INTRO } from '../atlas/content.js';
import CREDITS from '../atlas/credits.json';
const AT={story:null,rendered:null,listen:null};
const atlasRoot=$('#atlas');
const storyById=id=>ATLAS.find(s=>s.id===id);
const FEATURES=()=>ATLAS.filter(s=>s.arch);
function atlasPhoto(id,alt,cls=''){const c=CREDITS[id];return `<img class="${cls}" src="atlas/img/${id}.webp" width="${c.width}" height="${c.height}" alt="${esc(alt)}" loading="lazy" decoding="async">`;}
function atlasCredit(id){const c=CREDITS[id];return `<span class="photo-credit">Photo: ${esc(c.author)} · ${c.licenseUrl?`<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>`:esc(c.license)} · <a href="${esc(c.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></span>`;}
/** Our own renders, in light and dark ink; CSS shows the one that matches the theme. */
function atlasArt(arch,kind,alt){return `<span class="atlas-render">${['light','dark'].map(t=>`<img class="r-${t}" src="atlas/render/${arch}-${kind}-${t}.webp" alt="${t==='light'?esc(alt):''}" ${t==='dark'?'aria-hidden="true"':''} loading="lazy" decoding="async">`).join('')}</span>`;}
function atlasCyls(arch){return ARCHS[arch].cyl.length;}

function atlasCover(){
  const lead=storyById('origins');
  return `<div class="atlas-page atlas-cover">
    <header class="atlas-mast"><div class="eyebrow">Engine Lab</div><h1>${ATLAS_INTRO.title}</h1><p class="atlas-strap">${esc(ATLAS_INTRO.strap)}</p></header>
    <p class="atlas-lede">${esc(ATLAS_INTRO.lede)}</p>
    <button class="atlas-lead" data-story="${lead.id}">${atlasPhoto(lead.photo,lead.photoCaption)}<span class="atlas-lead-text"><span class="eyebrow">${esc(lead.kicker)}</span><strong>${esc(lead.title)}</strong><span class="atlas-dek">${esc(lead.dek)}</span><span class="atlas-more">Read the story →</span></span></button>
    <div class="atlas-grid">${FEATURES().map(s=>{const a=ARCHS[s.arch];return `<button class="atlas-card" data-story="${s.id}">${atlasArt(s.arch,'hero',`${a.full}, cutaway render`)}<span class="eyebrow">${esc(s.kicker)} · ${esc(a.full)}</span><strong>${esc(s.title)}</strong><span class="atlas-dek">${esc(s.dek)}</span><span class="atlas-meta">${atlasCyls(s.arch)} cylinder${atlasCyls(s.arch)>1?'s':''} · fires every ${esc(a.interval.split(' ')[0])}</span></button>`;}).join('')}</div>
    <footer class="atlas-foot"><p>Illustrations are rendered from this app’s engine model. Photographs are freely licensed from Wikimedia Commons and credited where they appear.</p><button class="link-btn" data-story="credits">All photo credits</button></footer>
  </div>`;
}
function atlasStory(s){
  const a=s.arch?ARCHS[s.arch]:null,features=FEATURES(),i=features.indexOf(s),next=s.arch?features[i+1]||null:features[0];
  const sections=s.body.map(([h,p],k)=>`<h2>${esc(h)}</h2><p${k===0?' class="dropcap"':''}>${esc(p)}</p>${k===0?`<blockquote class="pull">${esc(s.quote)}</blockquote>`:''}${k===1&&a?`<figure class="story-photo">${atlasPhoto(s.photo,s.photoCaption)}<figcaption>${esc(s.photoCaption)} ${atlasCredit(s.photo)}</figcaption></figure>`:''}`).join('');
  const glance=a?`<aside class="story-rail"><section class="glance"><h3>At a glance</h3><dl>${[['Layout',a.layout],['Crankshaft',a.crank],['Firing order',a.firing.join('–')],['Fires every',a.interval],['Balance',a.balance],['Character',a.character],['Packaging',a.packaging],['Found in',a.uses]].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${a.note?`<p class="small">${esc(a.note)}</p>`:''}</section>
    <section class="glance"><h3>Strengths</h3><ul>${a.pros.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><h3>Trade-offs</h3><ul>${a.cons.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section></aside>`:'';
  return `<article class="atlas-page atlas-story" aria-labelledby="storyTitle">
    <nav class="atlas-crumbs"><button class="link-btn" data-story="">← Atlas</button><span>${esc(s.kicker)}${a?' · '+esc(a.full):''}</span></nav>
    <header class="story-hero${a?'':' no-render'}"><div class="story-head"><div class="eyebrow">${esc(s.kicker)}</div><h1 id="storyTitle" tabindex="-1">${esc(s.title)}</h1><p class="story-dek">${esc(s.dek)}</p>
      ${a?`<dl class="story-facts"><div><dt>Cylinders</dt><dd>${atlasCyls(s.arch)}</dd></div><div><dt>Firing order</dt><dd>${esc(a.firing.join('–'))}</dd></div><div><dt>Fires every</dt><dd>${esc(a.interval.split(' ')[0])}</dd></div></dl>
      <div class="story-actions"><button class="btn primary" data-explore="${s.arch}">Explore in 3D →</button><div class="listen" role="group" aria-label="Listen at real speed"><button class="btn toggle" id="atlasListen" aria-pressed="false">▶ Listen</button><div class="segmented sm" id="atlasRpm" role="radiogroup" aria-label="Engine speed"><button role="radio" data-listen-rpm="900">Idle</button><button role="radio" data-listen-rpm="3000">3,000</button><button role="radio" data-listen-rpm="6000">6,000 rpm</button></div></div></div><p class="small listen-note" id="atlasListenNote">Synthesised from this layout’s firing order.</p>`:''}</div>
      ${a?`<figure class="story-render">${atlasArt(s.arch,'hero',`${a.full} in cutaway`)}<figcaption>Fig. 1 · ${esc(a.full)}, cut away to show the cylinders, pistons and valves.</figcaption></figure>`
         :`<figure class="story-render story-lead-photo">${atlasPhoto(s.photo,s.photoCaption)}<figcaption>${esc(s.photoCaption)} ${atlasCredit(s.photo)}</figcaption></figure>`}</header>
    <div class="story-body"><div class="story-text">${sections}</div>${glance}</div>
    ${a?`<figure class="story-exploded">${atlasArt(s.arch,'exploded',`${a.full}, exploded view`)}<figcaption>Fig. 2 · Exploded: cam cover, valve train and head above; pistons, rods and crankshaft below.</figcaption></figure>`:''}
    <section class="story-timeline"><h2>Timeline</h2><ol>${s.timeline.map(t=>`<li><span class="tl-year">${esc(t.year)}</span><span class="tl-text">${esc(t.text)} <a href="${esc(t.src)}" target="_blank" rel="noopener" class="src" aria-label="Source for ${esc(t.year)}">Source ↗</a></span></li>`).join('')}</ol></section>
    <section class="story-legends"><h2>${a?'Legends':'On the road'}</h2><div class="legend-grid">${s.legends.map(l=>`<article class="atlas-legend"><figure>${atlasPhoto(l.photo,l.name)}<figcaption>${atlasCredit(l.photo)}</figcaption></figure><h3>${esc(l.name)}</h3><p class="legend-meta">${esc(l.years)} · ${esc(l.engine)}</p><p>${esc(l.why)}</p></article>`).join('')}</div></section>
    ${next?`<nav class="story-next"><button class="atlas-next" data-story="${next.id}"><span class="eyebrow">Next · ${esc(next.kicker)}</span><strong>${esc(next.title)} →</strong></button></nav>`:''}
  </article>`;
}
function atlasCredits(){
  const used=new Map();for(const s of ATLAS){if(s.photo)used.set(s.photo,s.title);for(const l of s.legends)used.set(l.photo,l.name);}
  return `<article class="atlas-page atlas-story"><nav class="atlas-crumbs"><button class="link-btn" data-story="">← Atlas</button><span>Photo credits</span></nav>
    <h1 id="storyTitle" tabindex="-1">Photo credits</h1><p class="story-dek">All photographs are from Wikimedia Commons under the licences shown, resized for this page. The engine illustrations are rendered from this app’s own model.</p>
    <table class="credits"><thead><tr><th>Photograph</th><th>Author</th><th>Licence</th><th>Source</th></tr></thead><tbody>${[...used].map(([id,what])=>{const c=CREDITS[id];return `<tr><td>${esc(what)}</td><td>${esc(c.author)}</td><td>${c.licenseUrl?`<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>`:esc(c.license)}</td><td><a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.file.replace(/^File:/,''))}</a></td></tr>`;}).join('')}</tbody></table></article>`;
}
function renderAtlas(){
  const id=AT.story;if(AT.rendered===id&&atlasRoot.firstElementChild)return;AT.rendered=id;
  atlasRoot.innerHTML=id==='credits'?atlasCredits():id&&storyById(id)?atlasStory(storyById(id)):atlasCover();
  atlasRoot.querySelectorAll('[data-story]').forEach(b=>b.onclick=()=>openAtlas(b.dataset.story||null));
  atlasRoot.querySelectorAll('[data-explore]').forEach(b=>b.onclick=()=>exploreFromAtlas(b.dataset.explore));
  const listen=$('#atlasListen');
  if(listen){setChecked('#atlasRpm','listen-rpm',AT.listen?.rpm??3000);listen.onclick=()=>AT.listen?stopListening():startListening(+($('#atlasRpm [aria-checked="true"]')?.dataset.listenRpm||3000));
    atlasRoot.querySelectorAll('[data-listen-rpm]').forEach(b=>b.onclick=()=>{setChecked('#atlasRpm','listen-rpm',b.dataset.listenRpm);if(AT.listen)startListening(+b.dataset.listenRpm);});radioKeys($('#atlasRpm'));}
  atlasRoot.scrollTop=0;
}
/** Open the Atlas cover (id null), a story, or the credits page, and keep the address shareable. */
function openAtlas(id){
  stopListening();AT.story=id&&(id==='credits'||storyById(id))?id:null;
  try{const h=AT.story?'#atlas/'+AT.story:'#atlas';if(location.hash!==h)location.hash=h;}catch(e){}
  if(atlasRoot.hidden)showTab('atlas');else renderAtlas();
  (atlasRoot.querySelector('#storyTitle')||atlasRoot.querySelector('.atlas-mast h1'))?.focus?.();
}
function exploreFromAtlas(arch){stopListening();showTab('engine');if(renderer&&arch!==S.arch)setArch(arch);}
async function startListening(rpm){
  const s=storyById(AT.story);if(!s?.arch)return;
  const ok=await soundPreview(s.arch,rpm);
  if(!ok){$('#atlasListenNote').textContent='Sound is not available in this browser.';return;}
  AT.listen={arch:s.arch,rpm};$('#atlasListen').setAttribute('aria-pressed','true');$('#atlasListen').textContent='■ Stop';
  $('#atlasListenNote').textContent=`Playing the ${ARCHS[s.arch].full.toLowerCase()} at ${rpm.toLocaleString('en-US')} rpm, synthesised from its firing order.`;
}
function stopListening(){
  if(!AT.listen)return;AT.listen=null;soundPreviewStop();
  const b=$('#atlasListen');if(b){b.setAttribute('aria-pressed','false');b.textContent='▶ Listen';$('#atlasListenNote').textContent='Synthesised from this layout’s firing order.';}
}
