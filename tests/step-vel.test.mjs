import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ settings: { mode: 0, bass: false, sound: 0 } });
const { b } = bloom;

test('a saved step plays at the velocity its chord was played with', async () => {
    bloom.pad(0, 0, true, 45); await bloom.run(40);
    bloom.button(CC.SHIFT); bloom.step(0); bloom.step(0, false); bloom.button(CC.SHIFT, false); await bloom.run(20);
    bloom.pad(0, 0, false); await bloom.run(200);
    b.midi.length = 0;
    bloom.step(0); await bloom.run(40);
    const ons = b.midi.filter(m => m.on);
    assert.ok(ons.length);
    assert.ok(ons.every(m => m.vel === 45), 'played at 45: ' + ons.map(m => m.vel));
    bloom.step(0, false); await bloom.run(200);
    assert.deepEqual(bloom.hanging(), []);
});
