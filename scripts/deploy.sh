#!/bin/sh
# Build and copy Bloom straight onto a Move running Schwung (for development).
# Usage: ./scripts/deploy.sh                 (uses move.local)
#        MOVE_HOST=192.168.1.42 ./scripts/deploy.sh
set -e
cd "$(dirname "$0")/.."
HOST=${MOVE_HOST:-move.local}
DEST=/data/UserData/schwung/modules/overtake/bloom
./scripts/build.sh
ssh "ableton@$HOST" "mkdir -p $DEST && rm -f $DEST/chords.mjs $DEST/chords-*.mjs"
scp dist/bloom/* "ableton@$HOST:$DEST/"
echo "Installed Bloom on $HOST. Close and reopen Bloom to load it."
