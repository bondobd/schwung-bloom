import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom } from './harness.mjs';

const bloom = await loadBloom({ settings: { mode: 0, bass: true, chordCh: 3, bassCh: 1, sound: 0 }, inputModes: ['auto', 1, 'auto', 'auto'] });

test('a bass track with its own MIDI In channel plays bass there, live', async () => {
    bloom.b.midi.length = 0;
    bloom.pad(0, 0); await bloom.run(30); bloom.pad(0, 0, false); await bloom.run(30);
    const ons = bloom.b.midi.filter(m => m.on);
    assert.ok(ons.some(m => m.note < 48 && m.ch === 1), 'bass on channel 2');
    assert.ok(ons.filter(m => m.note >= 48).every(m => m.ch === 3), 'chords on channel 4');
    assert.match(bloom.text(), /BASS T2/);
});
