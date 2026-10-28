import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom } from './harness.mjs';

const bloom = await loadBloom({ settings: { mode: 0, bass: false, sound: 0 } });
const { b } = bloom;
const MAJ7 = 5, SEVEN = 4, ADD9 = 7;
const sounding = () => {
    const on = new Map();
    for (const m of b.midi) on.set(m.note, m.on);
    return [...on].filter(([, v]) => v).map(([n]) => n % 12).sort((x, y) => x - y);
};
const strumPlate = async () => {
    b.midi.length = 0;
    for (let c = 0; c < 4; c++) { bloom.pad(2, c); await bloom.run(15); bloom.pad(2, c, false); await bloom.run(15); }
    return [...new Set(b.midi.filter(m => m.on).map(m => m.note % 12))].sort((x, y) => x - y);
};

test('a colour tapped while holding a chord stays on it for strumming', async () => {
    bloom.pad(0, 0); await bloom.run(40);
    bloom.pad(3, MAJ7); await bloom.run(30); bloom.pad(3, MAJ7, false); await bloom.run(40);
    assert.deepEqual(sounding(), [0, 4, 7, 11], 'Cmaj7 after the Maj7 pad is let go');
    assert.match(bloom.text(), /Cmaj7/);
    assert.deepEqual(await strumPlate(), [0, 4, 7, 11], 'the strum plate plays Cmaj7');
});

test('a new 7th replaces the last, and tapping one again takes it off', async () => {
    bloom.pad(3, SEVEN); bloom.pad(3, SEVEN, false); await bloom.run(30);
    assert.match(bloom.text(), /C7/);
    bloom.pad(3, SEVEN); bloom.pad(3, SEVEN, false); await bloom.run(30);
    bloom.pad(3, ADD9); bloom.pad(3, ADD9, false); await bloom.run(30);
    assert.match(bloom.text(), /Cadd9/);
});

test('letting go of the chord clears its colours', async () => {
    bloom.pad(0, 0, false); await bloom.run(40);
    bloom.pad(0, 0); await bloom.run(40);
    assert.deepEqual(sounding(), [0, 4, 7]);
    bloom.pad(0, 0, false); await bloom.run(200);
});

test('holding a colour before the chord still works as before', async () => {
    bloom.pad(3, MAJ7); await bloom.run(20);
    bloom.pad(0, 3); await bloom.run(40);
    assert.match(bloom.text(), /Fmaj7/);
    bloom.pad(3, MAJ7, false); await bloom.run(40);
    assert.doesNotMatch(bloom.text(), /Fmaj7/);
    bloom.pad(0, 3, false); await bloom.run(200);
    assert.deepEqual(bloom.hanging(), []);
});

test('the strum plate stays on the last chord after it is let go', async () => {
    bloom.pad(0, 0); await bloom.run(40);
    bloom.pad(3, MAJ7); bloom.pad(3, MAJ7, false); await bloom.run(30);
    bloom.pad(0, 0, false); await bloom.run(200);
    assert.deepEqual(await strumPlate(), [0, 4, 7, 11], 'Cmaj7 still on the plate');
    assert.notEqual(bloom.padColor(2, 0), 0, 'the plate stays lit');
    bloom.pad(0, 3); await bloom.run(40); bloom.pad(0, 3, false); await bloom.run(200);
    assert.deepEqual(await strumPlate(), [0, 5, 9], 'then F');
    await bloom.run(200);
    assert.deepEqual(bloom.hanging(), []);
});

test('changing the colour keeps the velocity the chord was played with', async () => {
    bloom.pad(0, 0, true, 40); await bloom.run(40);
    b.midi.length = 0;
    bloom.pad(3, MAJ7); bloom.pad(3, MAJ7, false); await bloom.run(40);
    const ons = b.midi.filter(m => m.on);
    assert.ok(ons.length);
    assert.ok(ons.every(m => m.vel === 40), 'replayed at 40: ' + ons.map(m => m.vel));
    bloom.pad(0, 0, false); await bloom.run(200);
});

test('in Hold a tapped colour replaces the last one instead of stacking', async () => {
    const hold = await loadBloom({ settings: { mode: 0, bass: false, sound: 2 } });
    const h = hold.b;
    const notes = () => { const on = new Map(); for (const m of h.midi) on.set(m.note, m.on); return [...on].filter(([, v]) => v).map(([n]) => n % 12).sort((x, y) => x - y); };
    hold.pad(0, 0); await hold.run(40); hold.pad(0, 0, false); await hold.run(40);
    hold.pad(3, SEVEN); hold.pad(3, SEVEN, false); await hold.run(40);
    assert.match(hold.text(), /C7/);
    hold.pad(3, MAJ7); hold.pad(3, MAJ7, false); await hold.run(40);
    assert.deepEqual(notes(), [0, 4, 7, 11], 'Cmaj7, not C7 + Maj7');
    hold.pad(3, MAJ7); hold.pad(3, MAJ7, false); await hold.run(40);
    assert.deepEqual(notes(), [0, 4, 7], 'tapping it again goes back to plain C');
});

test('colours combine one per group: a new 7th replaces the last, add9 and sus layer on', async () => {
    const g = await loadBloom({ settings: { mode: 0, bass: false, sound: 0 } });
    const notes = () => { const on = new Map(); for (const m of g.b.midi) on.set(m.note, m.on); return [...on].filter(([, v]) => v).map(([n]) => n % 12).sort((x, y) => x - y); };
    const tap = async col => { g.pad(3, col); g.pad(3, col, false); await g.run(40); };
    g.pad(0, 0); await g.run(40);
    await tap(SEVEN); await tap(MAJ7); await tap(6);
    assert.deepEqual(notes(), [0, 4, 7, 9], 'C6, not C7 + Maj7 + 6');
    await tap(SEVEN); await tap(ADD9);
    assert.deepEqual(notes(), [0, 2, 4, 7, 10], 'C9');
    await tap(1);
    assert.deepEqual(notes(), [0, 2, 5, 7, 10], '9sus4');
    g.pad(0, 0, false); await g.run(200);

    g.pad(3, SEVEN); g.pad(3, MAJ7); await g.run(20);
    g.pad(0, 0); await g.run(40);
    assert.deepEqual(notes(), [0, 4, 7, 11], 'two 7th pads held at once: the newer one, Cmaj7');
    g.pad(0, 0, false); g.pad(3, SEVEN, false); g.pad(3, MAJ7, false); await g.run(200);
});
