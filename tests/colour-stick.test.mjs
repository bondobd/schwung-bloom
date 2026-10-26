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

test('colours stack, and tapping one again takes it off', async () => {
    bloom.pad(3, SEVEN); bloom.pad(3, SEVEN, false); await bloom.run(30);
    assert.match(bloom.text(), /C7|Cmaj7/);
    bloom.pad(3, MAJ7); bloom.pad(3, MAJ7, false); await bloom.run(30);
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
