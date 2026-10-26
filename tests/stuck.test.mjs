import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

/* Schwung's copy of Move's state stuck on "playing" while Move is stopped, as seen on hardware. */
const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, sound: 0 } });
const { b } = bloom;
b.move.infoPlaying = 1;

test('Play starts Move and the progression even when Schwung wrongly says Move is playing', async () => {
    await bloom.run(1800);
    bloom.button(CC.CAPTURE); await bloom.run(100);
    bloom.button(CC.PLAY); await bloom.run(100);
    assert.equal(b.move.playing, false, 'stopping the Capture preview leaves Move alone');
    b.controls.length = 0; b.midi.length = 0;
    bloom.button(CC.PLAY); await bloom.run(600);
    assert.ok(b.controls.includes(85), 'pressed Move\'s Play');
    assert.equal(b.move.playing, true);
    assert.match(bloom.text(), /PLAY/);
    assert.ok(b.midi.some(m => m.on), 'the progression plays');
    bloom.button(CC.PLAY); await bloom.run(300);
    assert.equal(b.move.playing, false);
});
