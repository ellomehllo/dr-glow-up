#!/usr/bin/env python3
# Downloads the per-tool ElevenLabs clips listed in <dir>/urls.tsv (name<TAB>url) and writes
# small mono mp3s to sounds/tool/<name>.mp3:
#   <tool>-loop  held sounds: silence trimmed, up to 4 s, crossfaded end-into-start so they loop seamlessly
#   <tool>-hit   one action while using the tool (a zap, a pluck, a press)
#   <tool>-done  the tool's job finished
#   tick / success / nope   soft shared sounds
# Usage: python3 -I tests/fetch-tool-sounds.py <dir with urls.tsv>
import os, re, subprocess, sys, urllib.request
src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'sounds', 'tool'); raw = os.path.join(src, 'raw')
os.makedirs(out, exist_ok=True); os.makedirs(raw, exist_ok=True)
MAX = {'hit': 0.9, 'done': 1.6, 'tick': 0.3, 'success': 1.4, 'nope': 0.8, 'perfect': 1.6, 'pick': 0.5, 'yay': 1.8}
LOUD = {'loop': -26, 'hit': -21, 'done': -21, 'tick': -24, 'success': -21, 'nope': -22, 'perfect': -22, 'pick': -26, 'yay': -22}
XF = 0.35  # loop crossfade, seconds

def ff(*a):
    r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *a], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-400:])
def dur(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)

def peak(f):
    log = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'max_volume: (-?[\d.]+) dB', log).group(1))
# raise to full level first, so the silence cut is relative to the clip (quiet clips aren't trimmed away)
def trim(f): return f'volume={-1 - peak(f):.1f}dB,silenceremove=start_periods=1:start_threshold=-36dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse'
for line in open(os.path.join(src, 'urls.tsv')):
    name, url = line.rstrip('\n').split('\t')
    kind = name.split('-')[-1] if '-' in name else name
    f = os.path.join(raw, name + '.mp3')
    if not os.path.exists(f): urllib.request.urlretrieve(url, f)
    o = os.path.join(out, name + '.mp3'); w = os.path.join(raw, name + '.wav')
    if kind == 'loop':
        ff('-i', f, '-af', f'{trim(f)},atrim=0:4', '-ac', '1', '-ar', '44100', w)
        L = dur(w); xf = min(XF, L / 4)
        # middle, then (tail fading out + head fading in): playing it on repeat has no seam
        fc = (f'[0]atrim=0:{xf},asetpts=PTS-STARTPTS,afade=t=in:d={xf}[h];'
              f'[0]atrim={L - xf}:{L},asetpts=PTS-STARTPTS,afade=t=out:d={xf}[t];'
              f'[h][t]amix=inputs=2:normalize=0[x];'
              f'[0]atrim={xf}:{L - xf},asetpts=PTS-STARTPTS[m];'
              f'[m][x]concat=v=0:a=1,loudnorm=I={LOUD[kind]}:TP=-3[o]')
        ff('-i', w, '-filter_complex', fc, '-map', '[o]', '-ac', '1', '-ar', '44100', '-b:a', '64k', o)
    else:
        mx = MAX[kind]
        ff('-i', f, '-af', f'{trim(f)},atrim=0:{mx},areverse,afade=t=in:d=0.08,areverse,afade=t=in:d=0.005,loudnorm=I={LOUD[kind]}:TP=-3',
           '-ac', '1', '-ar', '44100', '-b:a', '64k', o)
    print(f'{name:14} {dur(o):5.2f}s {os.path.getsize(o):6d}B')
