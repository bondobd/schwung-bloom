import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

/* Issue #2: with smooth voicing on, -/+ had no effect and chords drifted from the octave. */
const bloom = await loadBloom({ key: 7, settings: { mode: 0, bass: false, sound: 0, smooth: true } });
const { b } = bloom;
const centre = async (row, col) => {
    b.midi.length = 0; bloom.pad(row, col); await bloom.run(40); bloom.pad(row, col, false); await bloom.run(60);
    const n = b.midi.filter(m => m.on).map(m => m.note);
    return n.reduce((a, c) => a + c, 0) / n.length;
};
const press = async cc => { bloom.button(cc); await bloom.run(20); bloom.button(cc, false); await bloom.run(20); };

test('octave down with nothing held lowers the next chord an octave', async () => {
    const before = await centre(0, 0);
    await press(CC.MINUS);
    const after = await centre(0, 0);
    assert.ok(Math.abs(before - after - 12) <= 2, before + ' -> ' + after);
    await press(CC.PLUS);
});

test('chords stay near the octave over a long progression', async () => {
    const centres = [];
    for (let i = 0; i < 4; i++) for (const [r, c] of [[0, 0], [1, 5], [0, 3], [0, 4]]) centres.push(await centre(r, c));
    assert.ok(Math.min(...centres) > 52 && Math.max(...centres) < 72, centres.map(c => c.toFixed(1)).join(' '));
});
