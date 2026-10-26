import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom } from './harness.mjs';

const bloom = await loadBloom({ settings: { mode: 0, bass: false, sound: 0 } });
const { b } = bloom;
const TRACK2 = 42;

test('pads light up again after Move draws over them on a track press', async () => {
    await bloom.run(100);
    const before = new Map(b.leds);
    bloom.button(TRACK2); await bloom.run(20);
    for (let n = 68; n < 100; n++) b.leds.set(n, 0);
    bloom.button(TRACK2, false); await bloom.run(20);
    for (let n = 68; n < 100; n++) b.leds.set(n, 0);
    await bloom.run(1400);
    for (let n = 68; n < 100; n++) assert.equal(b.leds.get(n), before.get(n), 'pad ' + n);
});
