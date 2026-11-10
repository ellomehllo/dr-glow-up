#!/bin/zsh
# Downloads ElevenLabs generations listed in <sfx.tsv> <voice.tsv> (name<TAB>url),
# trims silence, caps length, converts to small mono mp3s in sounds/sfx and sounds/voice.
# Usage: tests/fetch-sounds.sh <dir-with-tsvs>
set -e
SRC=${1:?tsv dir}
ROOT=${0:A:h:h}
RAW=$SRC/raw; mkdir -p $RAW $ROOT/sounds/sfx $ROOT/sounds/voice
# per-sound max length in seconds (default 1.2 for sfx, 3.2 for voices)
typeset -A MAX; MAX=(whoosh 0.4 lock 0.6 nick 0.5 tick 0.25 pop 0.5 tink 0.6 drip 0.7 knock 0.8 oink 1.0 flash 0.9 stamp 0.6 thud 0.6 zap 0.8 splat 0.7 boing 0.9 success 1.3 perfect 1.6 fail 1.8 fanfare 2.2 cheer 2.0 sparkle 1.2 shing 1.0)
proc() { # kind name url
  local kind=$1 name=$2 url=$3 raw=$RAW/$2.mp3 out=$ROOT/sounds/$1/$2.mp3
  [[ -s $raw ]] || curl -sfL -o $raw "$url" || { echo "FAIL download $name"; return; }
  local max=${MAX[$name]:-$([[ $kind == voice ]] && echo 3.2 || echo 1.2)}
  ffmpeg -nostdin -loglevel error -y -i $raw -af "silenceremove=start_periods=1:start_threshold=-48dB,atrim=0:$max,areverse,silenceremove=start_periods=1:start_threshold=-62dB,afade=t=in:d=0.03,areverse,loudnorm=I=-16:TP=-1.5" -ac 1 -ar 44100 -b:a 64k $out
  printf '%-18s %6.2fs %5dB\n' $name $(ffprobe -v error -show_entries format=duration -of csv=p=0 $out) $(stat -f%z $out)
}
while IFS=$'\t' read -r n u; do proc sfx $n $u; done < $SRC/sfx.tsv
while IFS=$'\t' read -r n u; do proc voice $n $u; done < $SRC/voice.tsv
du -sh $ROOT/sounds
