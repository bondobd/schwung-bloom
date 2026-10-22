#!/bin/sh
# Render the README artwork in docs/art/*.html to PNGs in docs/images (needs Google Chrome).
set -e
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
render() {
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
        --virtual-time-budget=4000 --window-size="$2" --screenshot="$PWD/docs/images/$1.png" "file://$PWD/docs/art/$1.html" 2>/dev/null
    echo "docs/images/$1.png"
}
render hero 1600,800
[ -f docs/art/layout.html ] && render layout 1600,900
exit 0
