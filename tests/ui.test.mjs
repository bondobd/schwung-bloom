import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, bass: true, chordCh: 2, bassCh: 1, sound: 0 } });
const { b } = bloom;

test('selects the chord track when tracks are on MIDI In Auto', async () => {
    await bloom.run(800);
    assert.equal(b.move.selected, 2);
});

test('key chords are lit, others dark', () => {
    assert.ok(bloom.padColor(0, 0) > 0, 'C major lit');
    assert.equal(bloom.padColor(0, 1), 0, 'D major dark in C');
    assert.ok(bloom.padColor(1, 1) > 0, 'Dm lit');
});

test('a chord pad plays a chord and bass, and leaves nothing hanging', async () => {
    b.midi.length = 0;
    bloom.pad(0, 0); await bloom.run(30);
    const ons = b.midi.filter(m => m.on);
    assert.deepEqual(ons.filter(m => m.note >= 48).map(m => m.note % 12).sort((x, y) => x - y), [0, 4, 7]);
    assert.deepEqual(ons.filter(m => m.note < 48).map(m => m.note % 12), [0], 'bass on the root');
    bloom.pad(0, 0, false); await bloom.run(30);
    assert.deepEqual(bloom.hanging(), []);
});

test('hammering pads never leaves a note hanging', async () => {
    for (let i = 0; i < 40; i++) { bloom.pad(i % 2, i % 8); globalThis.tick(); bloom.pad(i % 2, i % 8, false); globalThis.tick(); }
    await bloom.run(300);
    assert.deepEqual(bloom.hanging(), []);
});

test('Capture writes a progression to steps 1-4', async () => {
    bloom.button(CC.CAPTURE); await bloom.run(1500);
    bloom.button(CC.SHIFT); bloom.button(CC.DELETE); bloom.button(CC.DELETE, false); bloom.button(CC.SHIFT, false);  // all notes off stops the preview
    await bloom.run(50);
    const saved = JSON.parse(Object.entries(b.files).find(([k]) => k.includes('/set-'))[1]).mems;
    assert.equal(saved.filter(Boolean).length, 4);
});

test('a held step takes its own gate and volume', async () => {
    bloom.step(0); await bloom.run(10);
    assert.equal(b.volumeOwned, 1, 'Volume knob kept from Move while a step is held');
    bloom.turn(CC.KNOB1 + 3, -3);                              // gate 75%
    bloom.turn(CC.KNOB1 + 4, -4);                              // volume 80%
    bloom.turn(CC.KNOB1 + 5, 6);                               // bass: DEFAULT -> ON -> OFF
    await bloom.run(10);
    bloom.step(0, false); await bloom.run(1500);
    assert.equal(b.volumeOwned, 0, 'and handed back on release');
    const step = JSON.parse(Object.entries(b.files).find(([k]) => k.includes('/set-'))[1]).mems[0];
    assert.equal(step.gate, 0.75);
    assert.equal(step.vol, 80);
    assert.equal(step.bassOn, false);
    assert.equal(typeof step.bass, 'number', 'the bass note survives the bass setting');
});

test('Record lays chords on the chord track, then bass on the bass track', async () => {
    b.controls.length = 0; b.midi.length = 0;
    bloom.button(CC.SHIFT); bloom.button(CC.REC); bloom.button(CC.SHIFT, false);
    const start = Date.now();
    while (Date.now() - start < 8000 && !b.spoken.some(s => s.startsWith('RECORDED'))) await bloom.run(20);
    assert.deepEqual(b.controls, [86, 85, 42, 86, 85]);
    assert.ok(b.midi.some(m => m.on && m.ch === 2 && m.note >= 48), 'chords on channel 3');
    assert.ok(b.midi.some(m => m.on && m.ch === 1 && m.note < 48), 'bass on channel 2');
    assert.ok(b.spoken.includes('RECORDED, CHORDS T3 + BASS T2'));
});

test('Play locks the progression to Move\'s clock and toggles', async () => {
    b.controls.length = 0; b.midi.length = 0;
    bloom.button(CC.PLAY); await bloom.run(600);
    assert.ok(b.controls.includes(85), 'Move started');
    assert.equal(b.move.playing, true);
    const firstChord = b.midi.find(m => m.on && m.note >= 48);
    assert.ok(firstChord, 'chords play');
    assert.ok(firstChord.t - b.move.startedAt < 80, 'first chord lands on Move\'s first beat');
    bloom.button(CC.PLAY); await bloom.run(100);
    assert.equal(b.move.playing, false);
    await bloom.run(300);
    assert.deepEqual(bloom.hanging(), []);
});

test('hold a track button and turn Volume: Move gets the track button held, and the knob only once', async () => {
    b.controls.length = 0;
    const raw = [];
    const inject = globalThis.move_midi_inject_to_move;
    globalThis.move_midi_inject_to_move = p => { if (p[0] === 0x0b) raw.push(p[2] + ':' + p[3]); inject(p); };
    bloom.button(42); bloom.turn(79, 2); bloom.button(42, false);
    globalThis.move_midi_inject_to_move = inject;
    assert.deepEqual(raw, ['42:127', '42:0'], 'Bloom does not copy the Volume knob; Schwung already passes it to Move');
});

test('leaving Bloom hands Move back the track it had', async () => {
    b.controls.length = 0;
    globalThis.onUnload();
    assert.deepEqual(b.controls, [43]);
    assert.deepEqual(bloom.hanging(), []);
});
