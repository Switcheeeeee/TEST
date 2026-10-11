#!/usr/bin/env bash
# Ajuste le volume sonore d'un rendu à -14 LUFS (niveau visé par Instagram et
# TikTok), crête vraie à -1,5 dB, en deux passes loudnorm. L'image est copiée
# telle quelle, sans réencodage.
#
# Usage : tools/normaliser-son.sh rendu-brut.mp4 renders/promo-moto-piste-privee.mp4
set -euo pipefail

in="$1"
out="$2"
target="I=-14:TP=-1.5:LRA=11"

stats=$(ffmpeg -hide_banner -nostats -i "$in" -af "loudnorm=${target}:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
read -r mi mtp mlra mth off < <(python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print(d["input_i"], d["input_tp"], d["input_lra"], d["input_thresh"], d["target_offset"])
' <<<"$stats")

ffmpeg -hide_banner -loglevel error -y -i "$in" -c:v copy \
  -af "loudnorm=${target}:measured_I=${mi}:measured_TP=${mtp}:measured_LRA=${mlra}:measured_thresh=${mth}:offset=${off}:linear=true" \
  -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$out"

ffmpeg -hide_banner -nostats -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
