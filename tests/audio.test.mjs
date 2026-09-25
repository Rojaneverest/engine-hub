// Engine sound synthesizer: event timing, firing-order character, modes, levels and worklet self-containment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineSynth } from '../app/audio/synth.js';
import { soundConfig, SOUND_TUNE } from '../app/audio/tune.js';
import { deriveEngine, VT } from '../src/core/sim.ts';

const SR = 48000, B = 128, ARCHS = ['single', 'i4', 'i6', 'v6', 'v8', 'flat6'];
function synth(arch, { mode = 'cycle', rpm = 900, gain = 0.8, Klass = EngineSynth } = {}) {
  const s = new Klass(SR); s.message(soundConfig(deriveEngine(arch), VT)); s.message({ type: 'mode', mode, rpm }); s.message({ type: 'gain', value: gain }); s.log = []; return s;
}
function run(s, secs, each) {
  const L = new Float32Array(B), R = new Float32Array(B); let sum = 0, peak = 0, n = 0, finite = true;
  for (let k = 0; k < Math.round(secs * SR / B); k++) {
    each?.(s, k * B / SR); s.process(L, R, B);
    for (let i = 0; i < B; i++) { const x = L[i], y = R[i]; if (!Number.isFinite(x) || !Number.isFinite(y)) finite = false; sum += x * x + y * y; peak = Math.max(peak, Math.abs(x), Math.abs(y)); n += 2; }
  }
  return { rms: Math.sqrt(sum / n), peak, finite };
}
const follow = rate => (s, t) => s.message({ type: 'state', theta: rate * t, rate });   // the app sends the crank angle every frame

test('the worklet copy is self-contained and runs from its serialised source', () => {
  const Klass = new Function(`return (${EngineSynth.toString()})`)();
  const s = synth('v8', { mode: 'real', Klass }); const r = run(s, 0.5);
  assert.ok(r.finite && r.rms > 0.005, 'serialised synth produces sound');
});
test('cycle mode plays every event once per cycle, in firing order, each at its crank angle', () => {
  const s = synth('i4'); run(s, 4.02, follow(180));                         // 720° at the app's 1× speed
  const fires = s.log.filter(e => e.kind === 1), eng = deriveEngine('i4');
  assert.equal(s.log.length, 20, 'five events for each of four cylinders');
  const order = fires.map(e => eng.cyls[e.cyl].n), from1 = [...order.slice(order.indexOf(1)), ...order.slice(0, order.indexOf(1))];
  assert.deepEqual(from1, [1, 3, 4, 2], 'combustion follows the 1-3-4-2 firing order');
  const angleOf = e => e.sample / SR * 180;
  for (const f of fires) {
    const want = (eng.cyls[f.cyl].off + VT.SPARK + 23) % 720;
    assert.ok(Math.abs(angleOf(f) - want) < 1.5, `cylinder ${eng.cyls[f.cyl].n} fires at ${want}°`);
    const spark = s.log.find(e => e.kind === 2 && e.cyl === f.cyl), gap = ((angleOf(f) - angleOf(spark)) % 720 + 720) % 720;
    assert.ok(Math.abs(gap - 23) < 1.5, `spark leads combustion by 23° (got ${gap.toFixed(1)})`);
  }
});
test('paused, backwards and jumping motion stay silent; only forward motion plays events', () => {
  const s = synth('single'); s.message({ type: 'state', theta: 120, rate: 0 });
  assert.ok(run(s, 0.5).rms < 1e-6, 'paused with the intake valve open is silent');
  run(s, 0.3, (x, t) => x.message({ type: 'state', theta: 120 - 400 * t, rate: 0 }));   // scrub backwards across events
  assert.equal(s.log.length, 0, 'scrubbing backwards plays nothing');
  s.message({ type: 'state', theta: 700, rate: 0 }); run(s, 0.3);                    // jump forward past spark and combustion
  assert.equal(s.log.length, 0, 'a jump snaps without playing the skipped events');
  run(s, 0.4, (x, t) => x.message({ type: 'state', theta: 700 + 150 * t, rate: 0 })); // small scrub forward through 12° (exhaust valve closes)
  assert.deepEqual(s.log.map(e => e.kind), [3], 'scrubbing forward plays what it passes');
});
test('real speed fires at the right rate, and the cross-plane V8 alone has uneven gaps within a bank', () => {
  for (const arch of ARCHS) {
    const eng = deriveEngine(arch), s = synth(arch, { mode: 'real', rpm: 3000 }); const r = run(s, 2);
    const fires = s.log.filter(e => e.kind === 1).length, expected = 3000 / 60 / 2 * eng.N * 2;
    assert.ok(Math.abs(fires - expected) <= eng.N + 1, `${arch}: ${fires} firings in 2 s ≈ ${expected}`);
    assert.ok(r.finite && r.peak < 0.95 && r.rms > 0.02, `${arch}: sensible level (rms ${r.rms.toFixed(3)}, peak ${r.peak.toFixed(2)})`);
  }
  const gaps = arch => {                                                         // exhaust intervals within bank 0, in crank degrees
    const eng = deriveEngine(arch), cfg = soundConfig(eng, VT), inBank = cfg.cyls.map((c, i) => c.bank === 0 ? i : -1).filter(i => i >= 0);
    const at = inBank.map(i => (cfg.cyls[i].off + VT.EVO) % 720).sort((a, b) => a - b);
    return [...new Set(at.map((a, i) => Math.round(((at[(i + 1) % at.length] - a) % 720 + 720) % 720)))];
  };
  assert.ok(gaps('v8').length > 1, `cross-plane V8 bank fires unevenly: ${gaps('v8')}`);
  for (const arch of ['i4', 'i6', 'v6', 'flat6']) assert.equal(gaps(arch).length, 1, `${arch} bank fires evenly`);
});
test('both modes sit in a similar loudness range for every layout, and gain 0 is silent', () => {
  for (const arch of ARCHS) {
    assert.ok(SOUND_TUNE[arch], arch);
    const cyc = run(synth(arch), 4, follow(180)), real = run(synth(arch, { mode: 'real', rpm: 3000 }), 2);
    const db = x => 20 * Math.log10(x);
    assert.ok(db(cyc.rms) > -32 && db(cyc.rms) < -14, `${arch} cycle ${db(cyc.rms).toFixed(1)} dBFS`);
    assert.ok(Math.abs(db(cyc.rms) - db(real.rms)) < 9, `${arch} modes within 9 dB`);
  }
  assert.equal(run(synth('v8', { mode: 'real', gain: 0 }), 0.5).rms, 0);
});
/** Share of spectral energy near the firing-order harmonics, and above 2 kHz, from a small radix-2 FFT. */
function spectrum(x) {
  const n = 1 << 16, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let j = 0; j < len / 2; j++) {
    const c = Math.cos(a * j), s = Math.sin(a * j), k = i + j + len / 2, vr = re[k] * c - im[k] * s, vi = re[k] * s + im[k] * c; re[k] = re[i + j] - vr; im[k] = im[i + j] - vi; re[i + j] += vr; im[i + j] += vi; } }
  return (lo, hi) => { let p = 0; for (let k = Math.round(lo * n / SR); k < Math.round(hi * n / SR); k++) p += re[k] * re[k] + im[k] * im[k]; return p; };
}
test('high rpm stays an engine note, not hiss (regression: 6,000 rpm used to be noise)', () => {
  for (const arch of ['i4', 'v8']) {
    const rpm = 6000, s = synth(arch, { mode: 'real', rpm }), L = new Float32Array(B), R = new Float32Array(B), x = new Float64Array(1 << 16);
    for (let k = 0; k < 200; k++) s.process(L, R, B);
    for (let k = 0; k < x.length / B; k++) { s.process(L, R, B); for (let i = 0; i < B; i++) x[k * B + i] = (L[i] + R[i]) / 2; }
    const band = spectrum(x), total = band(60, 8000), half = rpm / 60 / 2;
    let harmonic = 0; for (let h = 1; h * half < 8000; h++) harmonic += band(h * half * 0.97, h * half * 1.03);
    assert.ok(harmonic / total > 0.45, `${arch}: ${(harmonic / total * 100).toFixed(0)}% of energy is engine harmonics`);
    assert.ok(band(2000, 8000) / total < 0.15, `${arch}: ${(band(2000, 8000) / total * 100).toFixed(0)}% above 2 kHz`);
  }
});
test('real speed keeps its own crank while the app streams the (paused) animation angle every frame', () => {
  for (const arch of ['single', 'i4']) for (const rpm of [900, 3000, 6000]) {
    const eng = deriveEngine(arch), s = synth(arch, { mode: 'real', rpm }); let next = 0;
    run(s, 2, (x, t) => { if (t >= next) { x.message({ type: 'state', theta: 120, rate: 0 }); next += 1 / 120; } });
    const fires = s.log.filter(e => e.kind === 1).length, expected = rpm / 60 * eng.N;
    assert.ok(Math.abs(fires - expected) <= eng.N + 1, `${arch} @ ${rpm}: ${fires} firings in 2 s ≈ ${expected}`);
  }
});
test('the main-thread fallback (1024-sample blocks) keeps every firing at high rpm, where a block spans more than a cycle', () => {
  for (const sr of [44100, 48000]) for (const rpm of [6000, 6500]) {
    const eng = deriveEngine('v8'), s = new EngineSynth(sr); s.message(soundConfig(eng, VT)); s.message({ type: 'mode', mode: 'real', rpm }); s.message({ type: 'gain', value: 0.8 }); s.log = [];
    const n = 1024, L = new Float32Array(n), R = new Float32Array(n); let sum = 0, count = 0;
    for (let k = 0; k < Math.round(2 * sr / n); k++) { s.process(L, R, n); for (const x of L) { sum += x * x; count++; } }
    const fires = s.log.filter(e => e.kind === 1).length, expected = rpm / 60 * eng.N;
    assert.ok(Math.abs(fires - expected) <= eng.N * 2, `${sr} Hz @ ${rpm}: ${fires} firings in 2 s ≈ ${expected}`);
    assert.ok(Math.sqrt(sum / count) > 0.02, `${sr} Hz @ ${rpm}: audible`);
  }
});
