#!/bin/sh
# Build dist/bloom-module.tar.gz, the archive Schwung Manager installs.
#
# Schwung reloads ui.js every time a module opens but keeps the modules it imports
# cached until Move restarts, so chords.mjs ships under a name that changes with
# its contents. An update then takes effect without a restart.
set -e
cd "$(dirname "$0")/.."
ID=bloom
OUT=dist/$ID
rm -rf dist
mkdir -p "$OUT"

hash_of() { (md5sum "$1" 2>/dev/null || md5 -r "$1") | cut -c1-8; }
CHORDS=chords-$(hash_of src/chords.mjs).mjs

[ -f src/dsp.so ] || ./scripts/build-dsp.sh
cp src/module.json src/help.json src/dsp.so "$OUT/"
cp src/chords.mjs "$OUT/$CHORDS"
sed "s#from './chords.mjs'#from './$CHORDS'#" src/ui.js > "$OUT/ui.js"
grep -q "$CHORDS" "$OUT/ui.js" || { echo "ui.js has no ./chords.mjs import to rewrite" >&2; exit 1; }

tar -C dist -czf "dist/$ID-module.tar.gz" "$ID"
echo "Built dist/$ID-module.tar.gz ($CHORDS)"
