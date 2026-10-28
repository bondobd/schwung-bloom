import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ settings: { mode: 0, bass: true, chordCh: 3, bassCh: 3, sound: 0 } });
const { b } = bloom;
const bassSetting = dir => bloom.setting(1, dir);

test('bass on the chord track says so', async () => {
    globalThis.onMidiMessageInternal([0x90, 5, 127]);
    await bloom.run(10);
    assert.match(bloom.text(), /ON: CHORD TRACK/);
});

test('picking an Auto bass track explains the setup and keeps bass audible', async () => {
    bassSetting(1); await bloom.run(10);
    assert.match(bloom.text(), /T1 NEEDS A CHANNEL/);
    assert.match(bloom.text(), /set MIDI In to 1/);
    b.midi.length = 0;
    bloom.pad(0, 0); await bloom.run(30); bloom.pad(0, 0, false); await bloom.run(30);
    assert.ok(b.midi.some(m => m.on && m.note < 48 && m.ch === 3), 'bass still plays, on the chord channel');
});
