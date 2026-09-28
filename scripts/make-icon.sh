#!/usr/bin/env bash
# Rebuilds build/icon.icns from build/icon.svg (macOS only: sips + iconutil).
# electron-builder picks up build/icon.icns automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
set_dir="$work/icon.iconset"
mkdir "$set_dir"
sips -s format png build/icon.svg --out "$work/icon-1024.png" -z 1024 1024 >/dev/null
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work/icon-1024.png" --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$work/icon-1024.png" --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set_dir" -o build/icon.icns
echo "wrote build/icon.icns"
