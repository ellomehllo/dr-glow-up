#!/usr/bin/env python3
# Downloads each voice take (takes.tsv: name<TAB>url, one take = the words below with
# pauses between) and cuts it at the pauses into sounds/voice/<name>-<word>.mp3.
# Usage: python3 -I tests/split-voices.py <dir with takes.tsv>
import os, re, subprocess, sys, urllib.request
WORDS = ['ouch', 'ow', 'stop', 'wait', 'hey', 'aha', 'mmhmm', 'nice', 'hmm', 'meh']
src = sys.argv[1]; root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'sounds', 'voice'); raw = os.path.join(src, 'raw'); os.makedirs(raw, exist_ok=True); os.makedirs(out, exist_ok=True)
def ff(*a): return subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', *a], capture_output=True, text=True)
def segments(f, db):
  log = ff('-i', f, '-af', f'silencedetect=n={db}dB:d=0.18', '-f', 'null', '-').stderr
  dur = float(re.search(r'Duration: (\d+):(\d+):([\d.]+)', log).groups()[2]) + 60 * int(re.search(r'Duration: \d+:(\d+)', log).group(1))
  st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
  segs, cur = [], 0.0
  for s, e in zip(st, en + [dur]):
    if s - cur > 0.06: segs.append((cur, s))
    cur = e
  if dur - cur > 0.06: segs.append((cur, dur))
  return segs
for line in open(os.path.join(src, 'takes.tsv')):
  name, url = line.rstrip('\n').split('\t'); f = os.path.join(raw, name + '.mp3')
  if not os.path.exists(f): urllib.request.urlretrieve(url, f)
  segs = None
  for db in (-40, -36, -44, -32, -48):
    s = segments(f, db)
    if len(s) == len(WORDS): segs = s; break
  if not segs: print(name, 'could not split cleanly:', len(s), 'pieces'); continue
  for w, (a, b) in zip(WORDS, segs):
    a = max(0, a - 0.03); b = min(b + 0.06, a + 1.0)
    o = os.path.join(out, f'{name}-{w}.mp3')
    ff('-y', '-i', f, '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-af', 'afade=t=in:d=0.01,areverse,afade=t=in:d=0.05,areverse,loudnorm=I=-18:TP=-2', '-ac', '1', '-ar', '44100', '-b:a', '64k', o)
  print(name, 'ok', ' '.join(f'{w}:{b-a:.2f}' for w, (a, b) in zip(WORDS, segs)))
