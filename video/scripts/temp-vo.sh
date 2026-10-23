#!/usr/bin/env bash
# The temporary Chronicler: each VO line in src/script.ts spoken by a macOS voice, for
# timing the edit until the user's ElevenLabs takes (vo/vo-NN.mp3) arrive. Writes
# $DOW_VIDEO_DIR/vo-temp/vo-NN.wav; a line is remade only when its words change, and
# skipped once its real take exists. Voice: TEMP_VOICE (default Daniel, British), rate TEMP_RATE.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
media="${DOW_VIDEO_DIR:-$HOME/DoctrineOfWar-video}"
media="${media/#\~/$HOME}"
voice="${TEMP_VOICE:-Daniel}"
rate="${TEMP_RATE:-165}"
mkdir -p "$media/vo-temp"

if ! command -v say >/dev/null; then
  echo "temp-vo: macOS 'say' is not available; shots without a take run silent" >&2
  exit 0
fi

made=0
while IFS=$'\t' read -r id text; do
  [[ -f "$media/vo/$id.mp3" || -f "$media/vo/$id.wav" ]] && continue
  wav="$media/vo-temp/$id.wav"
  stamp="$media/vo-temp/$id.txt"
  want="$voice|$rate|$text"
  [[ -f "$wav" && -f "$stamp" && "$(cat "$stamp")" == "$want" ]] && continue
  aiff="$(mktemp -t "dow-$id").aiff"
  say -v "$voice" -r "$rate" -o "$aiff" "$text"
  ffmpeg -y -loglevel error -i "$aiff" -ar 48000 -ac 1 "$wav"
  rm -f "$aiff"
  printf '%s' "$want" >"$stamp"
  made=$((made + 1))
done < <(cd "$here/.." && npx --no-install tsx scripts/vo-lines.ts)

[[ $made -gt 0 ]] && echo "temp-vo: made $made line(s) with the voice $voice in $media/vo-temp"
exit 0
