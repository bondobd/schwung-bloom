import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ key: 0, settings: { mode: 0, bass: false, sound: 0, smooth: false, theme: 0 } });
const { b } = bloom;
const KNOB = k => CC.KNOB1 + k - 1;
const shiftTurn = async (k, detents) => { bloom.button(CC.SHIFT); bloom.turn(KNOB(k), detents); bloom.button(CC.SHIFT, false); await bloom.run(300); };
const tap = cc => { bloom.button(cc); bloom.button(cc, false); };
const lowest = async () => {
    b.midi.length = 0; bloom.pad(0, 0); await bloom.run(40); bloom.pad(0, 0, false); await bloom.run(60);
    return Math.min(...b.midi.filter(m => m.on).map(m => m.note)) % 12;
};
const after = async ms => { await bloom.run(ms ?? 1600); };   // let the toast clear
const spoke = re => b.spoken.some(s => re.test(s));

test('holding Menu shows the knob map, with Shift the Shift layer; letting go goes back', async () => {
    bloom.button(CC.MENU); await bloom.run(400);
    assert.match(bloom.text(), /KNOBS/);
    assert.match(bloom.text(), /GATE 100%/);
    bloom.button(CC.SHIFT); await bloom.run(50);
    assert.match(bloom.text(), /SHIFT \+ KNOBS/);
    assert.match(bloom.text(), /STRUM UP/);
    bloom.button(CC.SHIFT, false); bloom.button(CC.MENU, false); await bloom.run(50);
    assert.doesNotMatch(bloom.text(), /KNOBS|SETTINGS/);
});

test('tapping Menu opens Settings; Back or Menu closes it', async () => {
    tap(CC.MENU); await bloom.run(50);
    assert.match(bloom.text(), /SETTINGS/);
    assert.match(bloom.text(), /CHORDS ON/);
    tap(CC.BACK); await bloom.run(50);
    assert.doesNotMatch(bloom.text(), /SETTINGS/);
    tap(CC.MENU); await bloom.run(50); tap(CC.MENU); await bloom.run(50);
    assert.doesNotMatch(bloom.text(), /SETTINGS/);
});

test('turning a knob with Menu held does not open Settings', async () => {
    bloom.button(CC.MENU); bloom.turn(KNOB(8), 1); bloom.button(CC.MENU, false); await after();
    assert.doesNotMatch(bloom.text(), /SETTINGS/);
});

test('Settings: the wheel picks a row, click, then the wheel changes it', async () => {
    tap(CC.MENU); bloom.turn(CC.JOG, 3); tap(CC.JOG_CLICK); bloom.turn(CC.JOG, 1); await bloom.run(50);
    assert.match(bloom.text(), /MOONLIGHT/);
    tap(CC.JOG_CLICK); tap(CC.MENU); await bloom.run(50);
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

test('a key change on Move takes over again', async () => {
    b.move.key = 9;
    await bloom.run(1500);
    assert.equal(await lowest(), 9);
    await after();
    assert.match(bloom.text(), /A MAJOR/);
    assert.doesNotMatch(bloom.text(), /\*/);
});

test('Shift + knob 3 moves the chord rows', async () => {
    await shiftTurn(3, 4);
    assert.ok(spoke(/^CHORD ROWS START ON, (A#|Bb)/), b.spoken.slice(-2).join(' / '));
    await shiftTurn(3, -4);
});

test('Shift + knob 4 sets the sound: Hold keeps the chord ringing', async () => {
    await shiftTurn(4, 8);
    assert.ok(spoke(/^SOUND, HOLD/));
    bloom.pad(0, 0); await bloom.run(40); bloom.pad(0, 0, false); await bloom.run(60);
    assert.ok(bloom.hanging().length > 0, 'still ringing');
    bloom.pad(0, 0); bloom.pad(0, 0, false); await bloom.run(60);
    await shiftTurn(4, -8);
    assert.deepEqual(bloom.hanging(), []);
});

test('knob 4 is the gate, Shift + knob 8 is free', async () => {
    bloom.turn(KNOB(4), -4); await bloom.run(50);
    assert.ok(spoke(/^GATE, 75%/), b.spoken.slice(-2).join(' / '));
    bloom.turn(KNOB(4), 4); await bloom.run(50);
    const n = b.spoken.length;
    await shiftTurn(8, 8);
    assert.equal(b.spoken.length, n);
});
