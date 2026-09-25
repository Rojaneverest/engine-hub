/* =====================================================================
   Engine sound synthesizer.

   Every sound is tied to an event in the engine model's own timing:
   spark, combustion, exhaust valve opening (blowdown), valves seating and
   the intake stroke, per cylinder at that cylinder's firing offset. Exhaust
   pulses run through a simple pipe + muffler model per cylinder bank
   (after Baldan et al. 2015, "Physically informed car engine sound
   synthesis"), so each layout's firing order is what gives it character:
   a cross-plane V8's banks each fire unevenly, which is where its burble
   comes from.

   Two modes share this model:
   - cycle: follows the animation's crank angle. At the app's slowed speeds
     each event is heard on its own, exactly when it is seen.
   - real:  runs its own crank at a realistic rpm, so the same events fuse
     into an engine note.

   The class runs inside an AudioWorklet (its source is serialised with
   toString), on the main thread as a fallback, and in Node tests. It must
   stay self-contained: no imports, no module-level helpers, no class fields.
   ===================================================================== */
export class EngineSynth {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.seed = 0x2545f491;
    this.vt = { IVO: 708, IVC: 220, EVO: 500, EVC: 12, SPARK: 345 };
    this.cyls = [];                       // {off, bank, pan}
    this.events = [];                     // {cyl, kind, at}: global crank angle (mod 720) of each event
    this.banks = 1;
    this.tune = { pipes: [1, 1], refl: -0.7, loop: 0.35, muffler: 0.18, muffRefl: 0.45, body: 85, tone: 3000, width: 0.5, exhaust: 1, fire: 1, intake: 1 };
    this.mode = 'cycle'; this.rpm = 900;
    this.theta = 0; this.rate = 0; this.corr = 0; this.time = 0; this.synced = false;
    this.target = 0; this.gain = 0;
    this.gainCoef = 1 - Math.exp(-1 / (0.03 * sampleRate));
    this.voices = [];
    for (let i = 0; i < 128; i++) this.voices.push({ on: false, kind: 0, t: 0, a: 0, env: 0, dec: 0, env2: 0, dec2: 0, env3: 0, dec3: 0, len: 1, nz: 0, ph: 0, f: 0, b: 0, gl: 0, gr: 0, last: 0 });
    this.pipes = [this.makePipe(), this.makePipe()];
    this.intakeLp = 0; this.toneL = 0; this.toneR = 0; this.tone2L = 0; this.tone2R = 0; this.dcL = [0, 0]; this.dcR = [0, 0];
    this.level = 0; this.log = null; this.samples = 0;
    this.setPipes();
  }
  makePipe() { return { buf: new Float32Array(4096), i: 0, d: 150, lp: 0, mbuf: new Float32Array(1024), mi: 0, md: 25, mlp: 0, prev: 0 }; }
  setPipes() {
    for (let b = 0; b < 2; b++) {
      const p = this.pipes[b], len = this.tune.pipes[b] ?? this.tune.pipes[0];
      p.d = Math.max(8, Math.min(4000, Math.round(len / 343 * this.sr)));
      p.md = Math.max(4, Math.min(1000, Math.round(this.tune.muffler / 343 * this.sr)));
    }
  }
  noise() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 2147483648 - 1; }
  rand() { return (this.noise() + 1) / 2; }
  lift(c, o, cl) { const dur = ((cl - o) % 720 + 720) % 720, t = ((c - o) % 720 + 720) % 720; if (t >= dur) return 0; const s = Math.sin(Math.PI * t / dur); return s * s; }

  message(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'config') {
      if (m.vt) this.vt = Object.assign({}, this.vt, m.vt);
      this.cyls = (m.cyls || []).map(c => ({ off: +c.off || 0, bank: c.bank ? 1 : 0, pan: Math.max(-1, Math.min(1, +c.pan || 0)) }));
      this.banks = this.cyls.some(c => c.bank) ? 2 : 1;
      if (m.tune) this.tune = Object.assign({}, this.tune, m.tune);
      const v = this.vt, list = [];
      this.cyls.forEach((c, i) => {
        for (const [kind, a] of [[2, v.SPARK], [1, v.SPARK + 23], [0, v.EVO], [3, v.IVC], [3, v.EVC]]) list.push({ cyl: i, kind, at: ((c.off + a) % 720 + 720) % 720 });
      });
      this.events = list; this.setPipes();
    } else if (m.type === 'tune') { this.tune = Object.assign({}, this.tune, m.tune); this.setPipes(); }
    else if (m.type === 'mode') {
      if ((m.mode === 'cycle' || m.mode === 'real') && m.mode !== this.mode) { this.mode = m.mode; this.synced = false; this.corr = 0; }
      if (Number.isFinite(m.rpm)) this.rpm = Math.max(300, Math.min(9000, m.rpm));
    }
    else if (m.type === 'gain') { this.target = Math.max(0, Math.min(1, +m.value || 0)); }
    else if (m.type === 'state') {
      // Real speed runs its own crank; the animation's angle must not pull it back, or firings lock to the display's frame rate.
      if (this.mode === 'real') return;
      // Cycle mode follows the animation. Small differences are closed smoothly (and the events in between play,
      // like scrubbing tape); jumps of more than a quarter cycle snap silently.
      this.rate = +m.rate || 0;
      const e = (+m.theta || 0) - this.theta;
      if (!this.synced || Math.abs(e) > 180) { this.theta = +m.theta || 0; this.corr = 0; this.synced = true; }
      else this.corr = e * 12;
    }
  }
  mix() {
    // At real speed the exhaust note should dominate as rpm rises: turbulence, valve ticks and block thumps are
    // eased back above ~2,500 rpm, otherwise hundreds of them a second merge into hiss. Overall level rises gently with rpm,
    // as a real engine gets louder when it revs.
    const hi = Math.min(1, 2500 / Math.max(800, this.rpm));
    return this.mode === 'real'
      ? { ex: 0.4, nz: 0.1 * Math.max(0.25, hi * hi), nzTau: 0.003, fire: 0.14 * Math.max(0.35, hi), fireTau: 0.03, spark: 0, valve: 0.015 * hi * hi, intake: 0.025, drive: 1.6, out: 1.9 * (1 + 0.65 * Math.min(1, Math.max(0, (this.rpm - 900) / 5600))) }
      : { ex: 0.9, nz: 0.4, nzTau: 0.09, fire: 0.75, fireTau: 0.12, spark: 0.16, valve: 0.12, intake: 0.16, drive: 1.2, out: 1 };
  }
  spawn(kind, cyl, rate, at) {
    // Take a free voice; if none is free, replace the quietest one (never cut off a loud sound mid-way).
    let v = null, quietest = null;
    for (const x of this.voices) { if (!x.on) { v = x; break; } if (!quietest || x.a * x.env < quietest.a * quietest.env) quietest = x; }
    v = v || quietest;
    const c = this.cyls[cyl], mx = this.mix(), sr = this.sr, T = this.tune, jitter = 0.82 + 0.36 * this.rand();
    const pan = kind === 0 ? 0 : c.pan, g = (pan + 1) * Math.PI / 4;
    v.on = true; v.kind = kind; v.t = 0; v.b = c.bank; v.gl = Math.cos(g); v.gr = Math.sin(g); v.ph = 0; v.last = 0;
    if (kind === 0) {                 // exhaust blowdown: a pressure pulse (length ~40° of crank) plus turbulent noise
      const len = rate > 0 ? 40 / rate * sr : 0.012 * sr;
      v.len = Math.max(0.0015 * sr, Math.min(0.012 * sr, len));
      v.a = mx.ex * T.exhaust * jitter; v.nz = mx.nz; v.env = 1; v.dec = Math.exp(-1 / (mx.nzTau * sr));
    } else if (kind === 1) {          // combustion: a thump through the block, pitch dropping as the pressure falls
      // At real speed the thumps overlap, so each rings for at most ~60% of the gap to the next firing and keeps one
      // pitch: successive thumps then add up to the engine's tone instead of a wash of mismatched rumbles.
      const real = this.mode === 'real', gap = 120 / (Math.max(300, this.rpm) * Math.max(1, this.cyls.length));
      const tau = real ? Math.max(0.0015, Math.min(mx.fireTau, 0.6 * gap)) : mx.fireTau;
      v.a = mx.fire * T.fire * jitter; v.f = T.body * (real ? 1 : 0.9 + 0.2 * this.rand()); v.nz = real ? 0.1 : 0.35;
      v.env = 1; v.dec = Math.exp(-1 / (tau * sr)); v.env2 = 1; v.dec2 = Math.exp(-1 / (Math.min(0.012, tau) * sr)); v.env3 = 1; v.dec3 = Math.exp(-1 / (0.003 * sr));
    } else if (kind === 2) {          // spark: a short dry tick
      v.a = mx.spark; v.env = 1; v.dec = Math.exp(-1 / (0.0015 * sr));
    } else {                          // valve seating: a small metallic click
      // At real speed dozens of clicks a second overlap; ringing ones fuse into a steady 2.6–3.5 kHz whine, so they stay short.
      v.a = mx.valve * jitter; v.f = 2600 + 900 * this.rand(); v.env = 1; v.dec = Math.exp(-1 / ((this.mode === 'real' ? 0.0012 : 0.006) * sr));
    }
    if (v.a === 0) v.on = false;
    if (this.log) this.log.push({ kind, cyl, sample: this.samples + at });
  }
  /** Fire every event whose crank angle lies in (a, b]. Only forward motion plays events.
      A block can span more than one cycle (large main-thread fallback blocks at high rpm), so each event may occur several times. */
  scan(a, b, n) {
    if (!(b > a) || b - a > 720 * 8) return;
    const hits = [];
    for (const e of this.events) {
      let t = e.at + 720 * Math.ceil((a - e.at) / 720); if (t <= a) t += 720;      // first occurrence strictly after a
      for (; t <= b; t += 720) hits.push({ i: Math.min(n - 1, Math.floor((t - a) / (b - a) * n)), e });
    }
    hits.sort((x, y) => x.i - y.i);
    return hits;
  }
  intakeEnv(theta) {
    let s = 0; const v = this.vt;
    for (const c of this.cyls) s += this.lift(theta - c.off, v.IVO, v.IVC);
    return s;
  }
  process(L, R, n) {
    const sr = this.sr, dt = n / sr;
    this.time += dt;
    let rate;
    if (this.mode === 'real') {
      const wob = 1 + 0.012 * Math.sin(2 * Math.PI * 0.9 * this.time) + 0.006 * Math.sin(2 * Math.PI * 2.3 * this.time + 1.3);
      rate = this.rpm * 6 * wob;
    } else { rate = this.rate + this.corr; this.corr *= Math.exp(-dt * 10); }
    const a = this.theta, b = a + rate * dt; this.theta = b;
    const silent = this.target === 0 && this.gain < 1e-5;
    let busy = false; for (const v of this.voices) if (v.on) { busy = true; break; }
    if (silent && !busy) { for (let i = 0; i < n; i++) { L[i] = 0; R[i] = 0; } this.level *= 0.9; this.samples += n; return; }
    const hits = silent ? [] : (this.scan(a, b, n) || []);
    const mx = this.mix(), T = this.tune, P = this.pipes, twoBanks = this.banks > 1;
    const w = twoBanks ? T.width : 0, g0 = (1 - w) * Math.PI / 4, g1 = (1 + w) * Math.PI / 4;
    const p0l = Math.cos(g0), p0r = Math.sin(g0), p1l = Math.cos(g1), p1r = Math.sin(g1);
    // Intake noise is air moving, so it follows crank speed: silent when the engine is still, even with the valve open.
    const i0 = this.intakeEnv(a), i1 = this.intakeEnv(b), flow = this.mode === 'real' ? Math.min(1.5, Math.sqrt(rate / 5400)) : Math.min(1, Math.max(0, rate) / 120);
    const toneA = 1 - Math.exp(-2 * Math.PI * T.tone / sr), refl = T.refl, loop = T.loop, mr = T.muffRefl, drive = mx.drive, out = mx.out;
    let h = 0;
    for (let i = 0; i < n; i++) {
      while (h < hits.length && hits[h].i === i) { this.spawn(hits[h].e.kind, hits[h].e.cyl, rate, i); h++; }
      const nz = this.noise();
      let ex0 = 0, ex1 = 0, bl = 0, br = 0;
      for (const v of this.voices) {
        if (!v.on) continue;
        let x = 0;
        if (v.kind === 0) {
          x = (v.t < v.len ? v.a * Math.sin(Math.PI * v.t / v.len) : 0) + v.a * v.nz * nz * v.env; v.env *= v.dec;
          if (v.b) ex1 += x; else ex0 += x;
          if (v.t > v.len && v.env < 1e-3) v.on = false;
        } else {
          if (v.kind === 1) {
            v.ph += 2 * Math.PI * v.f * (1 + 0.7 * v.env2) / sr; v.env2 *= v.dec2;
            x = v.a * (Math.sin(v.ph) * v.env + v.nz * nz * v.env3); v.env *= v.dec; v.env3 *= v.dec3;
          } else if (v.kind === 2) { x = v.a * (nz - v.last) * v.env; v.last = nz; v.env *= v.dec; }
          else { v.ph += 2 * Math.PI * v.f / sr; x = v.a * Math.sin(v.ph) * v.env; v.env *= v.dec; }
          bl += x * v.gl; br += x * v.gr;
          if (v.env < 1e-4) v.on = false;
        }
        v.t++;
      }
      const o0 = this.pipe(P[0], ex0, refl, loop, mr), o1 = twoBanks ? this.pipe(P[1], ex1, refl, loop, mr) : 0;
      this.intakeLp += 0.08 * (nz - this.intakeLp);
      const inl = this.intakeLp * (i0 + (i1 - i0) * i / n) * mx.intake * T.intake * flow;
      let l = o0 * p0l + o1 * p1l + bl + inl * 0.7, r = o0 * p0r + o1 * p1r + br + inl * 0.7;
      // Two one-pole stages (12 dB/octave): the pipe radiates a derivative, which rises 6 dB/octave, so a single stage
      // left everything above the cutoff flat and the output hissed.
      this.toneL += toneA * (l - this.toneL); this.toneR += toneA * (r - this.toneR);
      this.tone2L += toneA * (this.toneL - this.tone2L); this.tone2R += toneA * (this.toneR - this.tone2R);
      l = this.dc(this.dcL, this.tone2L); r = this.dc(this.dcR, this.tone2R);
      this.gain += (this.target - this.gain) * this.gainCoef;
      l = Math.tanh(l * out * drive) / drive * this.gain; r = Math.tanh(r * out * drive) / drive * this.gain;
      L[i] = l; R[i] = r;
      this.level += 0.0005 * (0.5 * (l * l + r * r) - this.level);
    }
    this.samples += n;
  }
  /** One bank's exhaust: a pipe with a lossy reflection at its open end, a short muffler chamber, radiated as a derivative. */
  pipe(p, x, refl, loop, mr) {
    let j = p.i - p.d; if (j < 0) j += 4096;
    p.lp += loop * (p.buf[j] - p.lp);
    const y = x + refl * p.lp; p.buf[p.i] = y; p.i = (p.i + 1) & 4095;
    let k = p.mi - p.md; if (k < 0) k += 1024;
    p.mlp += 0.5 * (p.mbuf[k] - p.mlp);
    const z = y + mr * p.mlp; p.mbuf[p.mi] = z; p.mi = (p.mi + 1) & 1023;
    const o = z - p.prev; p.prev = z; return o * 4;
  }
  dc(s, x) { const y = x - s[0] + 0.995 * s[1]; s[0] = x; s[1] = y; return y; }
}
