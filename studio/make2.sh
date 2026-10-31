#!/usr/bin/env bash
# Engine 2: render a storyboard into a finished 1080x1920 MP4 with a beat-synced track,
# plus a contact sheet for checking it.
#   ./make2.sh storyboards/<id>.json [drive|dark|bright] [workers]
# Output: ../videos/<id>.mp4 and out/<id>-sheet.jpg (12 frames across the video)
set -euo pipefail
cd "$(dirname "$0")"
SB="$1"; STYLE="${2:-drive}"; WORKERS="${3:-2}"
ID="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$SB")"
FR="out/$ID-frames"
rm -rf "$FR"; mkdir -p "$FR" ../videos
node render2/capture.js "$SB" "$FR" "$WORKERS"
python3 audio/music.py "$FR/events.json" "out/$ID.wav" --style "$STYLE"
TMP="../videos/.$ID.tmp.mp4"
ffmpeg -v error -y -framerate 30 -i "$FR/f%05d.jpg" -i "out/$ID.wav" \
  -vf "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.1 -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -af "loudnorm=I=-14:TP=-1.2:LRA=9" -c:a aac -b:a 160k -ar 48000 -movflags +faststart -shortest \
  "$TMP"
mv "$TMP" "../videos/$ID.mp4"
N=$(ls "$FR"/*.jpg | wc -l)
SEL=$(python3 -c "n=$N;print('+'.join(f'eq(n\\\\,{int(n*k/12)+3})' for k in range(12)))")
ffmpeg -v error -y -i "../videos/$ID.mp4" -vf "select='$SEL',scale=270:480,tile=6x2" -frames:v 1 "out/$ID-sheet.jpg"
ffprobe -v error -show_entries format=duration,size -of compact "../videos/$ID.mp4"
echo "video: videos/$ID.mp4"
echo "sheet: studio/out/$ID-sheet.jpg"
