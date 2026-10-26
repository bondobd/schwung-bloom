import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

/* Move counts in for a bar and its clock counts that bar too: the chords must wait for it. */
const bloom = await loadBloom({ tempo: 480, countIn: true, settings: { mode: 0, bass: false, chordCh: 2, sound: 0 } });
const { b } = bloom;

test('with count-in, recording starts the chords a bar after Move starts', async () => {
    bloom.button(CC.CAPTURE); await bloom.run(50);
    bloom.button(CC.SHIFT); bloom.button(CC.DELETE); bloom.button(CC.DELETE, false); bloom.button(CC.SHIFT, false);
    await bloom.run(50);
    b.midi.length = 0;
    bloom.button(CC.SHIFT); bloom.button(CC.REC); bloom.button(CC.SHIFT, false);
    const start = Date.now();
    while (Date.now() - start < 8000 && !b.spoken.some(s => s.startsWith('RECORDED'))) await bloom.run(20);
    const first = b.midi.find(m => m.on && m.note >= 48);
    const bar = 4 * 60000 / 480;
    assert.ok(first, 'chords recorded');
    const offset = first.t - b.move.startedAt;
    assert.ok(Math.abs(offset - bar) < 80, 'first chord ' + offset + ' ms after Move started, want ' + bar);
});
