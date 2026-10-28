import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

/* Move 2.1.1: Schwung does not know the firmware, so it reports "playing" as 255 (unknown). */
const bloom = await loadBloom({ unknownTransport: true, tempo: 480, settings: { mode: 0, sound: 0 } });
const { b } = bloom;

test('an unknown "playing" is not taken for playing', async () => {
    await bloom.run(600);
    bloom.button(CC.CAPTURE); await bloom.run(100);
    bloom.button(CC.PLAY); await bloom.run(100);   // stop Capture's preview
    assert.equal(b.move.playing, false, 'stopping the preview leaves Move alone');
    b.controls.length = 0; b.midi.length = 0;
    bloom.button(CC.PLAY); await bloom.run(600);
    assert.ok(b.controls.includes(85), 'pressed Move\'s Play');
    assert.equal(b.move.playing, true);
    assert.ok(b.midi.some(m => m.on), 'the progression plays');
    bloom.button(CC.PLAY); await bloom.run(400);
    assert.equal(b.move.playing, false);
});

test('Move stopped on its own stops the progression', async () => {
    bloom.button(CC.PLAY); await bloom.run(600);
    assert.equal(b.move.playing, true);
    b.move.playing = false; await bloom.run(300);
    b.midi.length = 0; await bloom.run(600);
    assert.ok(!b.midi.some(m => m.on), 'no chords after Move stops');
});

test('without a clock reading, unknown means stopped', async () => {
    const fresh = await loadBloom({ unknownTransport: true, tempo: 480, settings: { mode: 0, sound: 0 } });
    fresh.b.move.clock = false;
    await fresh.run(600);
    fresh.button(CC.CAPTURE); await fresh.run(100);
    fresh.button(CC.PLAY); await fresh.run(100);
    fresh.b.controls.length = 0;
    fresh.button(CC.PLAY); await fresh.run(600);
    assert.ok(fresh.b.controls.includes(85), 'pressed Move\'s Play');
    assert.equal(fresh.b.move.playing, true, 'Play started Move rather than taking it as running');
});
