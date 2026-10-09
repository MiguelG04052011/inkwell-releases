#!/usr/bin/env bash
# Render one storyboard into a finished 1080x1920 MP4, plus a contact sheet for checking it.
#   ./make.sh storyboards/<id>.json [warm|bright|tense] [workers]
# Output: ../videos/<id>.mp4 and out/<id>-sheet.jpg (8 frames across the video)
set -euo pipefail
cd "$(dirname "$0")"
SB="$1"; MOOD="${2:-warm}"; WORKERS="${3:-2}"
ID="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$SB")"
FR="out/$ID-frames"
rm -rf "$FR"; mkdir -p "$FR" ../videos
node render/capture.js "$SB" "$FR" "$WORKERS"
python3 audio/sfx.py "$FR/times.json" "$SB" "out/$ID.wav" --mood "$MOOD"
ffmpeg -v error -y -framerate 30 -i "$FR/f%05d.jpg" -i "out/$ID.wav" \
  -vf "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -profile:v high -level 4.1 -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 128k -ar 48000 -movflags +faststart -shortest \
  "../videos/$ID.mp4"
N=$(ls "$FR"/*.jpg | wc -l)
SEL=$(python3 -c "n=$N;print('+'.join(f'eq(n\\\\,{int(n*k/8)+5})' for k in range(8)))")
ffmpeg -v error -y -i "../videos/$ID.mp4" -vf "select='$SEL',scale=270:480,tile=8x1" -frames:v 1 "out/$ID-sheet.jpg"
ffprobe -v error -show_entries format=duration,size -of compact "../videos/$ID.mp4"
echo "video: videos/$ID.mp4"
echo "sheet: studio/out/$ID-sheet.jpg"
