import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ key: 0, settings: { mode: 0, bass: false, sound: 0, smooth: false, theme: 0 } });
const { b } = bloom;
const MENU = 50, KNOB = k => CC.KNOB1 + k - 1;
const shiftTurn = async (k, detents) => { bloom.button(CC.SHIFT); bloom.turn(KNOB(k), detents); bloom.button(CC.SHIFT, false); await bloom.run(300); };
const lowest = async () => {
    b.midi.length = 0; bloom.pad(0, 0); await bloom.run(40); bloom.pad(0, 0, false); await bloom.run(60);
    return Math.min(...b.midi.filter(m => m.on).map(m => m.note)) % 12;
};
const after = async ms => { await bloom.run(ms ?? 1600); };   // let the toast clear

test('holding Menu shows the knob map, letting go goes back', async () => {
    bloom.button(MENU); await bloom.run(50);
    assert.match(bloom.text(), /KNOBS/);
    assert.match(bloom.text(), /VOL \d+%/);
    bloom.button(CC.SHIFT); await bloom.run(50);
    assert.match(bloom.text(), /SHIFT \+ KNOBS/);
    assert.match(bloom.text(), /CHORD T\d/);
    bloom.button(CC.SHIFT, false); bloom.button(MENU, false); await bloom.run(50);
    assert.doesNotMatch(bloom.text(), /KNOBS/);
});

test('Shift + knob 1 moves Bloom\'s key; the pads follow and the key shows *', async () => {
    assert.equal(await lowest(), 0);
    await shiftTurn(1, 8);
    assert.equal(await lowest(), 2, 'first pad is D');
    await after();
    assert.match(bloom.text(), /D MAJOR\*/);
});

test('Shift + knob 2 picks the scale, and the key holds while Move\'s stays the same', async () => {
    await shiftTurn(2, 4);
    await after();
    assert.match(bloom.text(), /MINOR/);
    assert.ok(bloom.padColor(1, 0) > 0, 'Dm lit in D minor');
    assert.ok(!(bloom.padColor(0, 0) > 0), 'D major dark in D minor');
    await bloom.run(800);
    assert.match(bloom.text(), /MINOR/);
});

test('plain knob 1 still sets the play mode', async () => {
    bloom.turn(KNOB(1), 4); await bloom.run(50);
    assert.ok(b.spoken.some(s => s.startsWith('PLAY MODE')), b.spoken.slice(-2).join(' / '));
});

test('a key change on Move takes over again', async () => {
    b.move.key = 9;
    await bloom.run(1500);
    assert.equal(await lowest(), 9);
    await after();
    assert.match(bloom.text(), /A MAJOR/);
    assert.doesNotMatch(bloom.text(), /\*/);
});

test('Shift + knob 8 sets pad colours', async () => {
    await shiftTurn(8, 4);
    assert.ok(b.spoken.some(s => s.startsWith('PAD COLOURS, MOONLIGHT')), b.spoken.slice(-2).join(' / '));
});
