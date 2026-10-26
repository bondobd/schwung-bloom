import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom } from './harness.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 6, rate: 1, bass: true, chordCh: 2, bassCh: 1, sound: 0 }, inputModes: ['auto', 1, 'auto', 'auto'] });
const { b } = bloom;

test('in Pulse the bass pulses with the chord, on the bass track', async () => {
    b.midi.length = 0;
    bloom.pad(0, 0); await bloom.run(320); bloom.pad(0, 0, false); await bloom.run(250);
    const bassHits = b.midi.filter(m => m.on && m.ch === 1);
    const chordHits = b.midi.filter(m => m.on && m.ch === 2);
    assert.ok(bassHits.length >= 4, 'bass hits: ' + bassHits.length);
    assert.equal(chordHits.length, bassHits.length * 3, 'one bass note per chord pulse');
    assert.deepEqual(bloom.hanging(), []);
});
