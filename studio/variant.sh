#!/usr/bin/env bash
# A platform variant of a rendered engine-2 video: same video up to the end card, a different end card.
# Run ./make2.sh first. Usage:
#   ./variant.sh storyboards/<id>.json <suffix> '<json merged into "end">'
# e.g. ./variant.sh storyboards/x.json bio '{"cta":"Link in bio · free to start"}'  ->  ../videos/<id>-bio.mp4
set -euo pipefail
cd "$(dirname "$0")"
SB="$1"; SUF="$2"; OVR="$3"
ID="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$SB")"
FR="out/$ID-frames"; VF="out/$ID-$SUF-frames"; VSB="out/$ID-$SUF.json"
[ -d "$FR" ] || { echo "render $SB with make2.sh first"; exit 1; }
python3 - "$SB" "$VSB" "$OVR" <<'EOF'
import json, sys
sb = json.load(open(sys.argv[1])); sb['end'].update(json.loads(sys.argv[3])); sb['id'] += '-' + 'variant'
json.dump(sb, open(sys.argv[2], 'w'), indent=1)
EOF
rm -rf "$VF"; cp -r "$FR" "$VF"
FROM=$(python3 -c "import json;e=json.load(open('$FR/events.json'));print(int(e['endStart']*30)-2)")
N=$(ls "$FR"/f*.jpg | wc -l)
LIST=$(python3 -c "print(','.join(str(i) for i in range($FROM, $N)))")
node render2/capture.js "$VSB" "$VF" 2 "$LIST" >/dev/null
TMP="../videos/.$ID-$SUF.tmp.mp4"
ffmpeg -v error -y -framerate 30 -i "$VF/f%05d.jpg" -i "out/$ID.wav" \
  -vf "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.1 -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -af "loudnorm=I=-14:TP=-1.2:LRA=9" -c:a aac -b:a 160k -ar 48000 -movflags +faststart -shortest "$TMP"
mv "$TMP" "../videos/$ID-$SUF.mp4"
echo "video: videos/$ID-$SUF.mp4"
