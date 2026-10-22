#!/bin/sh
# Build dsp/clock.c into src/dsp.so for Move (aarch64 Linux, Debian bookworm's glibc like Schwung).
# Needs Docker; runs natively on arm64 hosts and under emulation elsewhere.
set -e
cd "$(dirname "$0")/.."
docker run --rm --platform linux/arm64 -v "$PWD:/w" -w /w debian:bookworm-slim sh -c '
    apt-get update -qq >/dev/null && apt-get install -y -qq gcc libc6-dev >/dev/null &&
    gcc -O2 -fPIC -shared -Wall -Wextra -U_FORTIFY_SOURCE -o src/dsp.so dsp/clock.c'
file src/dsp.so 2>/dev/null || true
echo "Built src/dsp.so"
