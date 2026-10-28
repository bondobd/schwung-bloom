import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ key: 0, settings: { mode: 0, bass: false, sound: 0, smooth: false, theme: 0 } });
const { b } = bloom;
const MENU = 50, BACK = 51, KNOB = k => CC.KNOB1 + k - 1;
const turn = async (k, detents) => { bloom.turn(KNOB(k), detents); await bloom.run(300); };
const lowest = async () => {
    b.midi.length = 0; bloom.pad(0, 0); await bloom.run(40); bloom.pad(0, 0, false); await bloom.run(60);
    return Math.min(...b.midi.filter(m => m.on).map(m => m.note)) % 12;
};
const after = async ms => { await bloom.run(ms ?? 1600); };   // let the toast clear

test('Menu flips the knob pages, Back returns to PLAY', async () => {
    bloom.button(MENU); bloom.button(MENU, false); await after();
    assert.match(bloom.text(), /HARMONY  2\/3/);
    bloom.button(MENU); bloom.button(MENU, false); await after();
    assert.match(bloom.text(), /ROUTING  3\/3/);
    bloom.button(BACK); bloom.button(BACK, false); await after();
    assert.doesNotMatch(bloom.text(), /ROUTING|HARMONY/);
});

test('HARMONY knob 1 moves Bloom\'s key; the pads follow and the key shows *', async () => {
    bloom.button(MENU); bloom.button(MENU, false); await after(50);
    assert.equal(await lowest(), 0);
    await turn(1, 8);
    assert.equal(await lowest(), 2, 'first pad is D');
    await after();
    assert.match(bloom.text(), /KEY D/);
    bloom.button(BACK); bloom.button(BACK, false); await after();
    assert.match(bloom.text(), /D MAJOR\*/);
});

test('HARMONY knob 2 picks the scale, and the key holds while Move\'s stays the same', async () => {
    bloom.button(MENU); bloom.button(MENU, false); await after(50);
    await turn(2, 4);
    await after();
    assert.match(bloom.text(), /MINOR/);
    assert.ok(bloom.padColor(1, 0) > 0, 'Dm lit in D minor');
    assert.ok(!(bloom.padColor(0, 0) > 0), 'D major dark in D minor');
    await bloom.run(800);
    assert.match(bloom.text(), /MINOR/);
});

test('a key change on Move takes over again', async () => {
    b.move.key = 9;
    await bloom.run(1500);
    assert.equal(await lowest(), 9);
    bloom.button(BACK); bloom.button(BACK, false); await after();
    assert.match(bloom.text(), /A MAJOR/);
    assert.doesNotMatch(bloom.text(), /\*/);
});

test('Shift + knob 8 still sets pad colours from any page', async () => {
    bloom.button(CC.SHIFT); bloom.turn(KNOB(8), 4); bloom.button(CC.SHIFT, false); await bloom.run(50);
    assert.ok(b.spoken.some(s => s.startsWith('PAD COLOURS, MOONLIGHT')), b.spoken.slice(-2).join(' / '));
});
