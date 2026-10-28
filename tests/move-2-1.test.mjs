import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

/* Move 2.1.1 with Schwung 1.8, as reported in issue #2: injected buttons echo back, Record while
 * stopped only arms, and the selected track Schwung reports can be stale. */
const bloom = await loadBloom({ echo: true, recArmsOnly: true, staleSelected: 2, countIn: true, tempo: 480,
                                settings: { mode: 0, bass: false, chordCh: 2, sound: 0 } });
const { b } = bloom;
const beat = 60000 / 480;
const until = async (re, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms && !b.spoken.some(s => re.test(s))) await bloom.run(20); };

test('Play starts, stops and restarts although Schwung echoes the press back', async () => {
    bloom.button(CC.CAPTURE); await bloom.run(50);
    bloom.button(CC.PLAY); await bloom.run(100);   // stop Capture's preview
    for (const want of [true, false, true, false]) {
        await bloom.run(250);
        bloom.button(CC.PLAY); bloom.button(CC.PLAY, false); await bloom.run(500);
        assert.equal(b.move.playing, want);
    }
});

test('Shift+Record selects the chord track even when Schwung says it is selected, and starts Move itself when Record only arms', async () => {
    b.move.selected = 3;
    b.controls.length = 0; b.midi.length = 0;
    bloom.button(CC.SHIFT); bloom.button(CC.REC); bloom.button(CC.SHIFT, false);
    await until(/RECORDED|DID NOT/);
    assert.ok(b.spoken.some(s => s.startsWith('RECORDED')), b.spoken.slice(-2).join(' / '));
    const firstRec = b.controls.indexOf(86);
    assert.ok(b.controls.slice(0, firstRec).includes(41), 'track 3 pressed before Record');
    assert.equal(b.move.selected, 2);
    const ons = b.midi.filter(m => m.on && m.note >= 48);
    const beats = [...new Set(ons.map(m => Math.round((m.t - b.move.startedAt) / beat)))];
    assert.equal(beats[0] % 4, 0, 'first chord on a barline: ' + beats);
    assert.deepEqual(beats.map(x => x - beats[0]), [0, 4, 8, 12], 'one chord per bar: ' + beats);
    await bloom.run(300);
});

test('a live take also starts Move itself when Record only arms', async () => {
    b.spoken.length = 0;
    bloom.button(CC.REC);
    const t = Date.now();
    while (Date.now() - t < 8000 && !/REC LIVE/.test(bloom.text())) await bloom.run(20);
    assert.match(bloom.text(), /REC LIVE T3/);
    assert.equal(b.move.playing, true);
    bloom.button(CC.REC); await bloom.run(600);
    assert.equal(b.move.playing, false);
    assert.ok(b.spoken.some(s => s.startsWith('RECORDED')));
});
