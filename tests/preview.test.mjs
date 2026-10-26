import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, sound: 0 } });
const { b } = bloom;

test('Play stops the preview Capture starts, without starting Move', async () => {
    bloom.button(CC.CAPTURE); await bloom.run(300);
    assert.ok(b.midi.some(m => m.on), 'the new idea plays');
    bloom.button(CC.PLAY); await bloom.run(300);
    assert.equal(b.move.playing, false);
    assert.deepEqual(bloom.hanging(), []);
    b.midi.length = 0;
    await bloom.run(600);
    assert.equal(b.midi.filter(m => m.on).length, 0, 'nothing plays afterwards');
});
