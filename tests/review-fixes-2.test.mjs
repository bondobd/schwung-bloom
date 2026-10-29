import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const MAJ7 = 5;
const sounding = bloom => {
    const on = new Map();
    for (const m of bloom.b.midi) on.set(m.note, m.on);
    return [...on].filter(([, v]) => v).map(([n]) => n % 12).sort((x, y) => x - y);
};

test('the chord track is still selected when Schwung publishes no move info', async () => {
    const bloom = await loadBloom({ noInfo: true, tempo: 480, settings: { mode: 0, sound: 0, chordCh: 2 } });
    await bloom.run(2500);
    assert.ok(bloom.b.controls.includes(41), 'pressed track 3: ' + bloom.b.controls);
});

test('with Move\'s transport unknown and no clock, Play stops Move it started', async () => {
    const bloom = await loadBloom({ unknownTransport: true, tempo: 480, settings: { mode: 0, sound: 0 } });
    bloom.b.move.clock = false;
    await bloom.run(600);
    bloom.button(CC.CAPTURE); await bloom.run(100);
    bloom.button(CC.PLAY); await bloom.run(100);   // stop Capture's preview
    bloom.button(CC.PLAY); await bloom.run(800);
    assert.equal(bloom.b.move.playing, true);
    bloom.button(CC.PLAY); await bloom.run(400);
    assert.equal(bloom.b.move.playing, false, 'second Play stopped Move');
});

test('a colour let go during a recording does not stay down', async () => {
    const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, bass: false, sound: 2 } });
    bloom.button(CC.CAPTURE); bloom.button(CC.CAPTURE, false); await bloom.run(100);
    bloom.button(CC.PLAY); bloom.button(CC.PLAY, false); await bloom.run(100);
    bloom.pad(3, MAJ7); await bloom.run(20);
    bloom.button(CC.SHIFT); bloom.button(CC.REC); bloom.button(CC.REC, false); bloom.button(CC.SHIFT, false); await bloom.run(200);
    bloom.pad(3, MAJ7, false); await bloom.run(50);
    bloom.button(CC.REC); bloom.button(CC.REC, false); await bloom.run(1500);
    bloom.pad(0, 3); await bloom.run(40); bloom.pad(0, 3, false); await bloom.run(40);
    assert.doesNotMatch(bloom.text(), /Fmaj7/);
    bloom.b.midi.length = 0;
    bloom.pad(0, 3); await bloom.run(40); bloom.pad(0, 3, false); await bloom.run(40);
    assert.ok(bloom.b.midi.some(m => !m.on) && !bloom.b.midi.some(m => m.on), 'tapping the ringing chord stops it');
});

test('a colour tapped off a chord stays off for the next one, finger still down', async () => {
    const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, bass: false, sound: 0 } });
    bloom.pad(0, 0); await bloom.run(20);
    bloom.pad(3, MAJ7); await bloom.run(20); bloom.pad(3, MAJ7, false); await bloom.run(20);
    bloom.pad(3, MAJ7); await bloom.run(20);
    assert.doesNotMatch(bloom.text(), /Cmaj7/);
    bloom.pad(0, 0, false); bloom.pad(0, 3); await bloom.run(40);
    assert.doesNotMatch(bloom.text(), /Fmaj7/);
    bloom.pad(0, 3, false); bloom.pad(3, MAJ7, false); await bloom.run(40);
});

test('a hidden pad leaves the colours on the sounding chord', async () => {
    const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, bass: false, sound: 0 } });
    await bloom.run(300);
    let hidden = null;
    for (let r = 0; r < 2 && !hidden; r++) for (let c = 0; c < 8 && !hidden; c++) if (!(bloom.padColor(r, c) > 0)) hidden = [r, c];
    assert.ok(hidden, 'an out-of-key pad to press');
    bloom.pad(0, 0); await bloom.run(20);
    bloom.pad(3, MAJ7); await bloom.run(20); bloom.pad(3, MAJ7, false); await bloom.run(20);
    bloom.pad(...hidden); await bloom.run(20); bloom.pad(...hidden, false); await bloom.run(20);
    bloom.pad(3, 7); await bloom.run(20); bloom.pad(3, 7, false); await bloom.run(20);   // add9 joins maj7
    assert.match(bloom.text(), /Cmaj9/);
    bloom.pad(0, 0, false); await bloom.run(40);
});
