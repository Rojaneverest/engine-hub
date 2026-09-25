
/* =====================================================================
   LAB — displacement, rpm & piston speed, torque & power
   ===================================================================== */
const LAB={bore:86,stroke:86,n:4,rpm:3000,rs:86,T:300,trpm:4000,show:{na:true,big:true,turbo:true}};
const CURVES=[
  {k:'na',name:'High-revving 2.0 L, naturally aspirated',color:'--air',max:9000,kn:[[1000,150],[3000,172],[5500,190],[7500,212],[8500,205],[9000,195]]},
  {k:'big',name:'Large 6.2 L V8, naturally aspirated',color:'--power',max:6600,kn:[[1000,430],[2000,500],[3500,560],[4600,585],[5500,560],[6600,480]]},
  {k:'turbo',name:'2.0 L turbocharged',color:'--comp',max:6800,kn:[[1000,200],[1500,290],[1900,400],[5000,400],[6000,350],[6800,300]]}];
function curveT(cv,rpm){ const k=cv.kn; if(rpm<k[0][0]||rpm>cv.max) return null;
  for(let i=0;i<k.length-1;i++){ const [a,ta]=k[i],[b,tb]=k[i+1]; if(rpm<=b){ const t=(rpm-a)/(b-a); return ta+(tb-ta)*(1-Math.cos(Math.PI*t))/2; } } return k[k.length-1][1]; }
const kW=(T,rpm)=>T*rpm/9549, HP=kw=>kw/.7457;
const fmt=(v,d=0)=>v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
let labBuilt=false, labRAF=null, labA=0, labLast=0, labBaseline=null;
function buildLab(){ labBuilt=true; const L=$('#lab');
  L.innerHTML=`<div class="labwrap"><h1>Lab</h1><p>Three experiments that turn the numbers on a spec sheet into something you can see. These diagrams have their own settings; they do not resize the 3D engine.</p>
  <section class="lab-compare" aria-label="Experiment comparison"><div class="discovery-actions"><button class="btn sm" id="labSaveBaseline">Save current baseline</button><button class="btn sm" id="labRestoreBaseline" disabled>Restore baseline</button><button class="btn sm" id="labClearBaseline" disabled>Clear comparison</button></div><div id="labComparison" aria-live="polite"><p class="small">Keep a baseline, change one input, and compare what responds. Displacement, piston speed and power are independent experiments.</p></div></section>
  <section class="exp"><div>
    <h2>Displacement</h2>
    <p>Displacement is the volume the pistons sweep as they travel from the top of their stroke (TDC) to the bottom (BDC), added up over every cylinder. \u201c2.0 litres\u201d means all the pistons together sweep two litres.</p>
    <div class="ctl"><label for="dB">Bore (cylinder diameter) <b id="dBv"></b></label><input id="dB" type="range" min="60" max="110" step=".25"></div>
    <div class="ctl"><label for="dS">Stroke (piston travel) <b id="dSv"></b></label><input id="dS" type="range" min="50" max="110" step=".5"></div>
    <div class="ctl"><label for="dN">Cylinders <b id="dNv"></b></label><input id="dN" type="range" min="0" max="8" step="1"></div>
    <div class="presets"><span class="small" style="align-self:center">Real engines:</span>
      <button class="btn sm" data-pr="87,84,4">Honda F20C</button><button class="btn sm" data-pr="87,91,6">BMW S54</button><button class="btn sm" data-pr="86,86,6">Toyota 2JZ</button><button class="btn sm" data-pr="103.25,92,8">GM LS3</button><button class="btn sm" data-pr="105,80,1">KTM 690</button></div>
    <div class="readouts"><div class="ro"><span>Per cylinder</span><b id="dPer"></b></div><div class="ro"><span>Total</span><b id="dTot"></b></div><div class="ro"><span>Bore \u00f7 stroke</span><b id="dRat"></b></div></div>
    <p class="formula" id="dFor"></p><p class="small" id="dSq"></p>
  </div><div class="vis"><svg id="dVis" viewBox="0 0 560 420" role="img" aria-label="Cylinder with bore and stroke"></svg></div></section>

  <section class="exp"><div>
    <h2>RPM and piston speed</h2>
    <p>RPM counts crankshaft revolutions per minute. The piston must cover two strokes every revolution, stopping and reversing each time, so its speed and especially its acceleration climb steeply with rpm.</p>
    <div class="ctl"><label for="rR">Engine speed <b id="rRv"></b></label><input id="rR" type="range" min="500" max="9500" step="250"></div>
    <div class="ctl"><label for="rS">Stroke <b id="rSv"></b></label><input id="rS" type="range" min="50" max="110" step="1"></div>
    <div class="readouts"><div class="ro"><span>Crank turns per second</span><b id="rRev"></b></div><div class="ro"><span>Power strokes per cylinder per second</span><b id="rPS"></b></div>
      <div class="ro"><span>Mean piston speed</span><b id="rMean"></b></div><div class="ro"><span>Peak piston speed</span><b id="rPeak"></b></div>
      <div class="ro"><span>Peak acceleration (at TDC)</span><b id="rAcc"></b></div><div class="ro"><span>Inertial load vs 3,000 rpm</span><b id="rLoad"></b></div></div>
    <p class="small">Many high-revving road engines reach roughly 20\u201325 m/s mean piston speed at their redline. Inertial force grows with the square of rpm: double the rpm and the load on the rods quadruples. Rod length is fixed at 1.69\u00d7 stroke. Educational approximation.</p>
  </div><div class="vis"><svg id="rVis" viewBox="0 0 560 420" role="img" aria-label="Piston velocity over one revolution"></svg></div></section>

  <section class="exp"><div>
    <h2>Torque and power</h2>
    <p>Torque is twisting force: how hard the crankshaft is being turned. Power is how fast that twisting work gets done: torque multiplied by rotational speed. The same power can come from a big twist at low rpm or a smaller twist at high rpm.</p>
    <div class="ctl"><label for="tT">Crankshaft torque <b id="tTv"></b></label><input id="tT" type="range" min="50" max="700" step="10"></div>
    <div class="ctl"><label for="tR">Engine speed <b id="tRv"></b></label><input id="tR" type="range" min="1000" max="9000" step="100"></div>
    <div class="readouts"><div class="ro"><span>Power</span><b id="tP"></b></div><div class="ro"><span>Same power at double rpm needs</span><b id="tHalf"></b></div></div>
    <p class="formula">Power (kW) = torque (N\u00b7m) \u00d7 rpm \u00f7 9,549</p>
    <p class="small">Gearing trades wheel speed for wheel torque; it cannot create power. Acceleration also depends on mass, traction, gearing and resistance.</p>
  </div><div class="vis"><svg id="tVis" viewBox="0 0 560 420" role="img" aria-label="Crank with torque arrow and power curves"></svg></div></section>
  <section class="exp" style="grid-template-columns:1fr"><div>
    <h2 style="font-size:24px">Three engine characters</h2>
    <p>Illustrative curve shapes, not measured data for any specific engine. The engine-speed slider above moves the cursor. Solid lines are torque; dashed lines are power.</p>
    <div class="legend" id="tLeg"></div>
    <div class="vis" style="min-height:300px"><svg id="cVis" viewBox="0 0 900 320" role="img" aria-label="Conceptual torque and power curves"></svg></div>
    <p class="small">Why the shapes differ: the high-revving engine breathes best at high rpm (short stroke, tuned intake and cams), so its torque peaks late and power keeps climbing. The large V8 moves a lot of air per revolution, so it makes big torque everywhere but runs out of breath and piston speed sooner. The turbo engine\u2019s curve is flat because boost is limited electronically once the turbo spools. These are steady-state curves: turbo lag is the extra delay while the turbo speeds up after you press the pedal, which a steady-state curve cannot show.</p>
  </div></section></div>`;
  const bind=(id,key,f=Number)=>{ const el=$('#'+id); el.value=LAB[key]; el.oninput=()=>{ LAB[key]=f(el.value); labUpdate(); }; };
  const NS=[1,2,3,4,5,6,8,10,12]; const dn=$('#dN'); dn.value=NS.indexOf(LAB.n); dn.oninput=()=>{ LAB.n=NS[+dn.value]; labUpdate(); };
  bind('dB','bore'); bind('dS','stroke'); bind('rR','rpm'); bind('rS','rs'); bind('tT','T'); bind('tR','trpm');
  document.querySelectorAll('[data-pr]').forEach(b=>b.onclick=()=>{ const [x,y,n]=b.dataset.pr.split(',').map(Number); LAB.bore=x; LAB.stroke=y; LAB.n=n; $('#dB').value=x; $('#dS').value=y; dn.value=NS.indexOf(n); labUpdate(); });
  $('#tLeg').innerHTML=CURVES.map(c=>`<button class="btn sm" data-cv="${c.k}" aria-pressed="true" style="--c:var(${c.color})"><i style="display:inline-block;width:14px;height:3px;background:var(${c.color});border-radius:2px"></i>${c.name}</button>`).join('');
  document.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>{ LAB.show[b.dataset.cv]=!LAB.show[b.dataset.cv]; b.setAttribute('aria-pressed',LAB.show[b.dataset.cv]); labUpdate(); });
  $('#labSaveBaseline').onclick=()=>{labBaseline={...LAB};renderLabComparison();};
  $('#labRestoreBaseline').onclick=()=>{if(!labBaseline)return;Object.assign(LAB,labBaseline);for(const [id,key] of [['dB','bore'],['dS','stroke'],['rR','rpm'],['rS','rs'],['tT','T'],['tR','trpm']])$('#'+id).value=LAB[key];$('#dN').value=NS.indexOf(LAB.n);labUpdate();};
  $('#labClearBaseline').onclick=()=>{labBaseline=null;renderLabComparison();};
  labUpdate();
}
function labUpdate(){ const D=LAB;
  // displacement
  const per=Math.PI/4*D.bore*D.bore*D.stroke/1000, tot=per*D.n, rat=D.bore/D.stroke;
  $('#dBv').textContent=fmt(D.bore,D.bore%1?2:0)+' mm'; $('#dSv').textContent=fmt(D.stroke,D.stroke%1?1:0)+' mm'; $('#dNv').textContent=D.n;
  $('#dPer').innerHTML=fmt(per)+' <small>cc</small>'; $('#dTot').innerHTML=fmt(tot)+' <small>cc \u2248 '+(tot/1000).toFixed(1)+' L</small>'; $('#dRat').textContent=rat.toFixed(2);
  $('#dFor').innerHTML=`Volume = \u03c0/4 \u00d7 bore\u00b2 \u00d7 stroke \u00d7 cylinders<br>= 0.785 \u00d7 ${fmt(D.bore/10,2)}\u00b2 cm \u00d7 ${fmt(D.stroke/10,2)} cm \u00d7 ${D.n} = ${fmt(tot)} cm\u00b3`;
  $('#dSq').textContent=rat>1.03?'Oversquare (bore larger than stroke): room for bigger valves and shorter piston travel, so it tends to suit high rpm.':rat<.97?'Undersquare (stroke longer than bore): higher piston speed at a given rpm. Torque also depends on displacement, cylinder pressure and breathing; stroke alone does not determine it.':'Square (bore \u2248 stroke): a balanced middle ground.';
  // rpm
  const s=D.rs/1000, w=D.rpm*2*Math.PI/60, r=s/2, Lr=r*G.L/G.r;
  let pk=0; for(let a=0;a<360;a+=1){ const v=Math.abs(dsdphi(a,r,Lr))*w; if(v>pk) pk=v; }
  const acc=r*w*w*(1+r/Lr)/9.81;
  $('#rRv').textContent=fmt(D.rpm)+' rpm'; $('#rSv').textContent=D.rs+' mm';
  $('#rRev').textContent=fmt(D.rpm/60,1); $('#rPS').textContent=fmt(D.rpm/120,1);
  $('#rMean').innerHTML=fmt(2*s*D.rpm/60,1)+' <small>m/s</small>'; $('#rPeak').innerHTML=fmt(pk,1)+' <small>m/s</small>';
  $('#rAcc').innerHTML=fmt(acc)+' <small>g</small>'; $('#rLoad').innerHTML=fmt(Math.pow(D.rpm/3000,2),2)+' <small>\u00d7</small>';
  // torque/power
  const p=kW(D.T,D.trpm); $('#tTv').textContent=D.T+' N\u00b7m'; $('#tRv').textContent=fmt(D.trpm)+' rpm';
  $('#tP').innerHTML=fmt(p)+' <small>kW ('+fmt(HP(p))+' hp)</small>'; $('#tHalf').innerHTML=fmt(D.T/2)+' <small>N\u00b7m at '+fmt(D.trpm*2)+' rpm</small>';
  drawDisp(0); drawRpmStatic(); drawCurves(); renderLabComparison(); }
function drawDisp(a){ const D=LAB, sc=2.6, cx=230, top=46, b=D.bore*sc, st=D.stroke*sc, ch=14, tdc=top+ch, bdc=tdc+st;
  const f=sweptFrac(a), py=tdc+f*st, x0=cx-b/2, x1=cx+b/2, n=D.n;
  let s=`<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--air)" stroke-width="1.2" opacity=".5"/></pattern></defs>`;
  s+=`<rect x="${x0-14}" y="${top-26}" width="${b+28}" height="26" rx="3" fill="var(--line2)"/><text x="${cx}" y="${top-9}" text-anchor="middle" font-size="12" fill="var(--muted)">cylinder head</text>`;
  s+=`<rect x="${x0}" y="${tdc}" width="${b}" height="${st}" fill="url(#hatch)"/><rect x="${x0}" y="${tdc}" width="${b}" height="${st}" fill="var(--air)" opacity=".08"/>`;
  s+=`<line x1="${x0-12}" x2="${x0}" y1="${top}" y2="${top}" stroke="var(--text)"/><rect x="${x0-12}" y="${top}" width="12" height="${bdc-top+60}" fill="var(--line2)"/><rect x="${x1}" y="${top}" width="12" height="${bdc-top+60}" fill="var(--line2)"/>`;
  s+=`<rect x="${x0+2}" y="${py}" width="${b-4}" height="54" rx="4" fill="var(--faint)"/><line x1="${x0+2}" x2="${x1-2}" y1="${py+10}" y2="${py+10}" stroke="var(--bg2)" stroke-width="2"/><line x1="${x0+2}" x2="${x1-2}" y1="${py+18}" y2="${py+18}" stroke="var(--bg2)" stroke-width="2"/>`;
  s+=`<line x1="${cx}" x2="${cx}" y1="${py+30}" y2="${Math.min(410,py+130)}" stroke="var(--faint)" stroke-width="10" stroke-linecap="round"/>`;
  for(const [y,l] of [[tdc,'TDC'],[bdc,'BDC']]) s+=`<line x1="${x0-30}" x2="${x1+40}" y1="${y}" y2="${y}" stroke="var(--brass)" stroke-dasharray="4 4"/><text x="${x1+44}" y="${y+4}" font-size="13" fill="var(--brass)" font-weight="600">${l}</text>`;
  s+=`<line x1="${x1+24}" x2="${x1+24}" y1="${tdc}" y2="${bdc}" stroke="var(--text)"/><text x="${x1+32}" y="${(tdc+bdc)/2}" font-size="13" fill="var(--text)">stroke ${fmt(D.stroke,D.stroke%1?1:0)} mm</text>`;
  s+=`<line x1="${x0}" x2="${x1}" y1="${bdc+30}" y2="${bdc+30}" stroke="var(--text)"/><line x1="${x0}" x2="${x0}" y1="${bdc+24}" y2="${bdc+36}" stroke="var(--text)"/><line x1="${x1}" x2="${x1}" y1="${bdc+24}" y2="${bdc+36}" stroke="var(--text)"/>`;
  s+=`<text x="${cx}" y="${Math.min(bdc+52,414)}" text-anchor="middle" font-size="13" fill="var(--text)">bore ${fmt(D.bore,D.bore%1?2:0)} mm</text>`;
  s+=`<text x="${cx}" y="${(tdc+Math.max(py,tdc+18))/2+4}" text-anchor="middle" font-size="12" fill="var(--air)" font-weight="600">${py-tdc>22?'swept volume':''}</text>`;
  const per=Math.PI/4*D.bore*D.bore*D.stroke/1000; const gw=Math.min(28,150/Math.max(n,1));
  s+=`<text x="420" y="60" font-size="13" fill="var(--muted)">\u00d7 ${n} cylinder${n>1?'s':''}</text>`;
  for(let i=0;i<n;i++){ const gx=420+(i%4)*(gw+8), gy=74+Math.floor(i/4)*72, gh=40*D.stroke/86, gwd=gw*D.bore/86;
    s+=`<rect x="${gx}" y="${gy}" width="${gwd}" height="${gh}" rx="2" fill="var(--air)" opacity=".35" stroke="var(--air)"/>`; }
  s+=`<text x="420" y="${80+Math.ceil(n/4)*72}" font-size="13" fill="var(--text)">${fmt(per*n)} cc total</text>`;
  $('#dVis').innerHTML=s; }
function drawRpmStatic(){ const D=LAB, s=D.rs/1000, w=D.rpm*2*Math.PI/60, r=s/2, Lr=r*G.L/G.r;
  const X=a=>40+a/360*490, vmax=Math.max(30,Math.ceil(pistonMetrics(D.rpm,D.rs).peak/10)*10), Y=v=>390-v/vmax*140; let pts='';
  for(let a=0;a<=360;a+=3){ const v=Math.abs(dsdphi(a,r,Lr))*w; pts+=(a?'L':'M')+X(a).toFixed(1)+','+Y(Math.min(v,vmax)).toFixed(1); }
  const mean=2*s*D.rpm/60;
  let g=`<line x1="40" x2="530" y1="390" y2="390" stroke="var(--line2)"/><text x="40" y="410" font-size="11" fill="var(--faint)">0\u00b0 TDC</text><text x="${X(180)}" y="410" text-anchor="middle" font-size="11" fill="var(--faint)">180\u00b0 BDC</text><text x="530" y="410" text-anchor="end" font-size="11" fill="var(--faint)">360\u00b0</text>`;
  for(const v of [vmax/3,vmax*2/3,vmax]) g+=`<line x1="40" x2="530" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="34" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--faint)">${fmt(v,0)}</text>`;
  g+=`<text x="40" y="236" font-size="12" fill="var(--muted)">piston speed (m/s) through one revolution</text>`;
  g+=`<path d="${pts}" fill="none" stroke="var(--power)" stroke-width="2.2"/><line x1="40" x2="530" y1="${Y(Math.min(mean,vmax))}" y2="${Y(Math.min(mean,vmax))}" stroke="var(--brass)" stroke-dasharray="5 4"/><text x="528" y="${Y(Math.min(mean,vmax))-5}" text-anchor="end" font-size="11" fill="var(--brass)">mean</text>`;
  g+=`<g id="rAnim"></g>`; $('#rVis').innerHTML=g; }
function drawRpmAnim(a){ const g=$('#rAnim'); if(!g) return; const D=LAB; const r=25*D.rs/86, Lr=r*G.L/G.r, cx=150, cy=200;
  const p=a*DEG, px=cx+r*Math.sin(p), py=cy-r*Math.cos(p), sy=cy-pistonS(a,r,Lr);
  g.innerHTML=`<rect x="${cx-34}" y="${cy-r-Lr-44}" width="68" height="${2*r+60}" fill="none" stroke="var(--line2)"/>
   <circle cx="${cx}" cy="${cy}" r="${r+10}" fill="none" stroke="var(--line2)"/><line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="var(--text)" stroke-width="7" stroke-linecap="round"/>
   <line x1="${px}" y1="${py}" x2="${cx}" y2="${sy}" stroke="var(--muted)" stroke-width="5" stroke-linecap="round"/>
   <rect x="${cx-30}" y="${sy-26}" width="60" height="34" rx="4" fill="var(--faint)"/><circle cx="${cx}" cy="${cy}" r="5" fill="var(--brass)"/>
   <text x="260" y="70" font-size="13" fill="var(--muted)">Shown ${fmt(Math.max(1,Math.round(D.rpm/60/1.2)))}\u00d7 slower than real</text>
   <text x="260" y="92" font-size="13" fill="var(--muted)">The piston stops twice per turn,</text><text x="260" y="110" font-size="13" fill="var(--muted)">then must reach ${fmt(Math.abs(dsdphi(75,D.rs/2000,D.rs/2000*G.L/G.r))*D.rpm*2*Math.PI/60,1)} m/s within ~75\u00b0.</text>
   <line x1="${40+(a%360)/360*490}" x2="${40+(a%360)/360*490}" y1="250" y2="390" stroke="var(--brass)"/>`; }
function drawTorqueAnim(a){ const svg=$('#tVis'); if(!svg) return; const D=LAB, cx=190, cy=210, r=110, p=a*DEG;
  const px=cx+r*Math.cos(p), py=cy+r*Math.sin(p), tx=-Math.sin(p), ty=Math.cos(p), fl=30+D.T/700*120;
  svg.innerHTML=`<circle cx="${cx}" cy="${cy}" r="${r+22}" fill="none" stroke="var(--line2)" stroke-dasharray="3 5"/>
   <line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="var(--text)" stroke-width="10" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="12" fill="var(--brass)"/>
   <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="var(--power)"/></marker></defs>
   <line x1="${px}" y1="${py}" x2="${px+tx*fl}" y2="${py+ty*fl}" stroke="var(--power)" stroke-width="5" marker-end="url(#ah)"/>
   <text x="${cx}" y="${cy+r+50}" text-anchor="middle" font-size="13" fill="var(--muted)">torque = force \u00d7 lever arm</text>
   <text x="360" y="120" font-size="14" fill="var(--text)" font-weight="600">Twist: ${D.T} N\u00b7m</text><text x="360" y="142" font-size="13" fill="var(--muted)">(arrow length)</text>
   <text x="360" y="190" font-size="14" fill="var(--text)" font-weight="600">Speed: ${fmt(D.trpm)} rpm</text><text x="360" y="212" font-size="13" fill="var(--muted)">(rotation rate, slowed)</text>
   <text x="360" y="260" font-size="14" fill="var(--power)" font-weight="600">Power: ${fmt(kW(D.T,D.trpm))} kW</text><text x="360" y="282" font-size="13" fill="var(--muted)">twist \u00d7 speed</text>`; }
function drawCurves(){ const svg=$('#cVis'); if(!svg) return; const W=900,H=320, X=r=>60+r/9500*(W-120), YT=t=>H-36-t/700*(H-60), YP=p=>H-36-p/400*(H-60);
  let s=''; for(let r=1000;r<=9000;r+=1000) s+=`<line x1="${X(r)}" x2="${X(r)}" y1="24" y2="${H-36}" stroke="var(--line)"/><text x="${X(r)}" y="${H-18}" text-anchor="middle" font-size="11" fill="var(--faint)">${r/1000}k</text>`;
  for(const t of [0,200,400,600]) s+=`<text x="52" y="${YT(t)+4}" text-anchor="end" font-size="11" fill="var(--faint)">${t}</text>`;
  for(const p of [0,100,200,300,400]) s+=`<text x="${W-52}" y="${YP(p)+4}" font-size="11" fill="var(--faint)">${p}</text>`;
  s+=`<text x="16" y="16" font-size="11.5" fill="var(--muted)">torque N\u00b7m</text><text x="${W-10}" y="16" text-anchor="end" font-size="11.5" fill="var(--muted)">power kW</text><text x="${X(9500)/2+30}" y="${H-2}" text-anchor="middle" font-size="11.5" fill="var(--muted)">engine speed (rpm)</text>`;
  const rr=LAB.trpm; let tags='';
  CURVES.forEach((c,ci)=>{ if(!LAB.show[c.k]) return; let dt='',dp=''; for(let r=c.kn[0][0];r<=c.max;r+=50){ const t=curveT(c,r); if(t==null) continue; dt+=(dt?'L':'M')+X(r).toFixed(1)+','+YT(t).toFixed(1); dp+=(dp?'L':'M')+X(r).toFixed(1)+','+YP(kW(t,r)).toFixed(1); }
    s+=`<path d="${dt}" fill="none" stroke="var(${c.color})" stroke-width="2.4"/><path d="${dp}" fill="none" stroke="var(${c.color})" stroke-width="2" stroke-dasharray="6 5"/>`;
    const t=curveT(c,rr); tags+=`<text x="${X(rr)+8}" y="${40+ci*18}" font-size="12" fill="var(${c.color})">${t==null?'beyond redline':fmt(t)+' N\u00b7m, '+fmt(kW(t,rr))+' kW'}</text>`; });
  s+=`<line x1="${X(rr)}" x2="${X(rr)}" y1="24" y2="${H-36}" stroke="var(--brass)" stroke-width="1.5"/>`+tags; svg.innerHTML=s; }
function labLoop(now){ if($('#lab').hidden){ labRAF=null; return; } const dt=Math.min(.05,(now-(labLast||now))/1000); labLast=now;
  labA+=dt*(RM?0:1);
  drawDisp((labA*120)%360); drawRpmAnim((labA*360*LAB.rpm/60/Math.max(1,Math.round(LAB.rpm/60/1.2)))%360); drawTorqueAnim(labA*LAB.trpm/9000*360*.6);
  labRAF=requestAnimationFrame(labLoop); }
function labStart(){ if(!labBuilt) buildLab(); if(!labRAF){ labLast=0; labRAF=requestAnimationFrame(labLoop); } }


function renderLabComparison(){
  const el=$('#labComparison');if(!el)return;
  $('#labRestoreBaseline').disabled=$('#labClearBaseline').disabled=!labBaseline;
  if(!labBaseline){el.innerHTML='<p class="small">Keep a baseline, change one input, and compare what responds. Displacement, piston speed and power are independent experiments.</p>';return;}
  const measure=d=>[Math.PI/4*d.bore*d.bore*d.stroke*d.n/1000,2*d.rs/1000*d.rpm/60,kW(d.T,d.trpm)],base=measure(labBaseline),now=measure(LAB);
  const names=['Displacement','Mean piston speed','Power'],units=['cc','m/s','kW'];
  el.innerHTML='<div class="readouts">'+now.map((v,i)=>{const delta=v-base[i],digits=i===1?1:0;return `<div class="ro"><span>${names[i]}</span><b>${fmt(v,digits)} <small>${units[i]}</small></b><span>Baseline ${fmt(base[i],digits)} · ${delta>=0?'+':''}${fmt(delta,digits)} ${units[i]}</span></div>`;}).join('')+'</div><p class="small">Baseline saved for this session. Compare one experiment at a time; these settings are independent.</p>';
}
