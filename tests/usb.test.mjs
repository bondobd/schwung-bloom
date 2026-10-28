import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ settings: { mode: 0, bass: true, chordCh: 2, bassCh: 1, sound: 0 } });
const { b } = bloom;
const KNOB7 = CC.KNOB1 + 6;

function usbHanging() {
    const on = new Map();
    for (const m of b.usb) if (m.type === 0x90 || m.type === 0x80) on.set(m.ch + ':' + m.note, m.on ? 1 : 0);
    return [...on].filter(([, v]) => v).map(([k]) => k);
}

test('MIDI out starts on Move only', async () => {
    bloom.pad(0, 0); await bloom.run(30); bloom.pad(0, 0, false); await bloom.run(30);
    assert.equal(b.usb.length, 0);
    assert.ok(b.midi.some(m => m.on));
});

test('MIDI out USB (Settings) sends chords on channel 1 and bass on channel 2 over USB, Move silent', async () => {
    bloom.setting(2, 2); await bloom.run(10);
    assert.match(bloom.text(), /MIDI OUT: USB/);
    b.midi.length = 0; b.usb.length = 0;
    bloom.pad(0, 0); await bloom.run(30);
    const ons = b.usb.filter(m => m.on);
    assert.deepEqual(ons.filter(m => m.note >= 48).map(m => m.ch), [0, 0, 0]);
    assert.deepEqual(ons.filter(m => m.note < 48).map(m => m.ch), [1], 'bass on channel 2 without any Move setup');
    assert.equal(b.midi.filter(m => m.on).length, 0);
    bloom.pad(0, 0, false); await bloom.run(250);
    assert.deepEqual(usbHanging(), []);
    assert.deepEqual(b.midi.filter(m => m.on), []);
});

test('a full USB port delays notes instead of dropping them', async () => {
    b.usb.length = 0;
    b.usbFull = 5;
    bloom.pad(0, 0); await bloom.run(40);
    assert.equal(b.usb.filter(m => m.on).length, 4);
    bloom.pad(0, 0, false); await bloom.run(40);
    assert.deepEqual(usbHanging(), []);
});

test('switching back to Move releases what USB was playing', async () => {
    b.usb.length = 0;
    bloom.pad(0, 0); await bloom.run(30);
    bloom.setting(2, -2); await bloom.run(30);
    assert.deepEqual(usbHanging(), []);
    bloom.pad(0, 0, false); await bloom.run(30);
});
