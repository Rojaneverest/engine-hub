#!/usr/bin/env python3
"""Narration → per-line voice clips → public/audio/manifest.json (durations drive the shot timing).

Providers (TTS_PROVIDER=auto picks the first available):
  fish   Fish Audio API     FISH_API_KEY (required), FISH_REFERENCE_ID (voice model id), FISH_MODEL (default s1)
  piper  local Piper voice  PIPER_VOICE=path/to/voice.onnx  (default ./voices/en-us-lessac-medium.onnx)
  say    macOS `say`        SAY_VOICE (default Samantha)
  espeak espeak-ng          last-resort placeholder
  manual pre-recorded clips  audio/manual/<line id>.{mp3,wav,m4a} (e.g. downloaded from the Fish web app); never auto-picked
Clips are cached by (provider, voice, text); only changed lines are re-synthesised.
Run `npx tsx scripts/export-timeline.ts` first (writes build/narration.json)."""
import hashlib, json, os, shutil, subprocess, sys, tempfile, urllib.request, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VO_DIR = os.path.join(ROOT, 'public', 'audio', 'vo'); CACHE = os.path.join(ROOT, 'build', 'tts-cache')
MANIFEST = os.path.join(ROOT, 'public', 'audio', 'manifest.json')
MANUAL_DIR = os.path.join(ROOT, 'audio', 'manual')

def _piper_model():
    for p in [os.environ.get('PIPER_VOICE'), os.path.join(ROOT, 'voices', 'en-us-lessac-medium.onnx'), '/home/claude/voices/en-us-lessac-medium.onnx']:
        if p and os.path.exists(p): return p
    return None

def available(name):
    if name == 'fish': return bool(os.environ.get('FISH_API_KEY'))
    if name == 'piper':
        try: import piper  # noqa
        except Exception: return False
        return _piper_model() is not None
    if name == 'say': return shutil.which('say') is not None
    if name == 'espeak': return shutil.which('espeak-ng') or shutil.which('espeak')
    if name == 'manual': return os.path.isdir(MANUAL_DIR)
    return False

def synth_fish(text, out_path):
    body = {'text': text, 'format': 'wav', 'normalize': True, 'latency': 'normal'}
    if os.environ.get('FISH_REFERENCE_ID'): body['reference_id'] = os.environ['FISH_REFERENCE_ID']
    req = urllib.request.Request('https://api.fish.audio/v1/tts', data=json.dumps(body).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + os.environ['FISH_API_KEY'], 'Content-Type': 'application/json', 'model': os.environ.get('FISH_MODEL', 's1')})
    with urllib.request.urlopen(req, timeout=120) as r, open(out_path, 'wb') as f: f.write(r.read())

_PIPER = None
def synth_piper(text, out_path):
    global _PIPER
    from piper import PiperVoice
    if _PIPER is None: _PIPER = PiperVoice.load(_piper_model())
    scale = float(os.environ.get('PIPER_LENGTH_SCALE', '1.0'))
    with wave.open(out_path, 'wb') as w:
        if hasattr(_PIPER, 'synthesize_wav'):
            try:
                from piper import SynthesisConfig
                _PIPER.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=scale))
            except ImportError: _PIPER.synthesize_wav(text, w)
        else: _PIPER.synthesize(text, w, length_scale=scale)

def synth_say(text, out_path):
    aiff = out_path + '.aiff'; subprocess.run(['say', '-v', os.environ.get('SAY_VOICE', 'Samantha'), '-r', os.environ.get('SAY_RATE', '175'), '-o', aiff, text], check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', aiff, out_path], check=True); os.remove(aiff)

def synth_espeak(text, out_path):
    subprocess.run([shutil.which('espeak-ng') or 'espeak', '-v', 'en-us', '-s', '155', '-w', out_path, text], check=True)

def _manual_clip(line_id):
    hits = [f for f in os.listdir(MANUAL_DIR) if os.path.splitext(f)[0] == line_id]
    if not hits: raise FileNotFoundError(f'no clip for {line_id} in audio/manual/')
    return os.path.join(MANUAL_DIR, hits[0])

def synth_manual(line_id, out_path):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', _manual_clip(line_id), out_path], check=True)

PROVIDERS = {'fish': synth_fish, 'piper': synth_piper, 'say': synth_say, 'espeak': synth_espeak, 'manual': synth_manual}

def voice_id(p):
    return {'fish': 'fish:' + os.environ.get('FISH_REFERENCE_ID', 'default'), 'piper': 'piper:' + os.path.basename(_piper_model() or ''),
            'say': 'say:' + os.environ.get('SAY_VOICE', 'Samantha'), 'espeak': 'espeak', 'manual': 'manual'}[p]

def finish(raw, out):
    """Trim silence at both ends, resample to 48 kHz mono, gentle high-pass; return duration in seconds."""
    trim = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', f'{trim},highpass=f=70,aresample=48000', '-ac', '1', '-c:a', 'pcm_s16le', out], check=True)
    with wave.open(out) as w: return w.getnframes() / w.getframerate()

def load_env():
    """Read KEY=VALUE lines from .env (real environment variables take precedence)."""
    p = os.path.join(ROOT, '.env')
    if not os.path.exists(p): return
    for line in open(p):
        line = line.split('#', 1)[0].strip()
        if '=' in line:
            k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip())

def main():
    load_env()
    want = os.environ.get('TTS_PROVIDER', 'auto')
    order = [want] if want != 'auto' else ['fish', 'piper', 'say', 'espeak']
    prov = next((p for p in order if available(p)), None)
    if not prov: sys.exit('No TTS provider available (set FISH_API_KEY, install piper-tts + a voice, or use macOS say).')
    lines = json.load(open(os.path.join(ROOT, 'build', 'narration.json')))
    os.makedirs(VO_DIR, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    man.pop('mix', None); man['voice'] = voice_id(prov); man['lines'] = {}
    print(f'TTS provider: {man["voice"]}  ({len(lines)} lines)')
    for ln in lines:
        # manual clips are keyed by file contents so a re-downloaded take replaces the cached one
        src = open(_manual_clip(ln['id']), 'rb').read().hex() if prov == 'manual' else ln['text']
        key = hashlib.sha1((man['voice'] + '|' + src).encode()).hexdigest()[:16]
        cached = os.path.join(CACHE, key + '.wav'); out = os.path.join(VO_DIR, ln['id'] + '.wav')
        if not os.path.exists(cached):
            with tempfile.TemporaryDirectory() as td:
                raw = os.path.join(td, 'raw.wav')
                try: PROVIDERS[prov](ln['id'] if prov == 'manual' else ln['text'], raw)
                except Exception as e: sys.exit(f'{prov} failed on line {ln["id"]}: {e}')
                finish(raw, cached)
        shutil.copyfile(cached, out)
        with wave.open(out) as w: dur = w.getnframes() / w.getframerate()
        man['lines'][ln['id']] = {'dur': round(dur, 3), 'file': f'audio/vo/{ln["id"]}.wav'}
        print(f'  {ln["id"]:4s} {dur:5.2f}s  {ln["text"][:70]}')
    json.dump(man, open(MANIFEST, 'w'), indent=1)
    print('wrote', os.path.relpath(MANIFEST, ROOT))

if __name__ == '__main__': main()
