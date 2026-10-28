import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';
import { voicingLabel } from '../src/chords.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, bass: false, chordCh: 2, sound: 0 } });
const { b } = bloom;
const tap = async (cc, ms = 30) => { bloom.button(cc); bloom.button(cc, false); await bloom.run(ms); };
const save = async s => { bloom.pad(0, 0); await bloom.run(30); bloom.pad(0, 0, false); bloom.button(CC.SHIFT); bloom.step(s); bloom.step(s, false); bloom.button(CC.SHIFT, false); await bloom.run(50); };

test('Delete + track button does not leave Delete stuck', async () => {
    await save(0);
    bloom.button(CC.DELETE); bloom.button(41); bloom.button(41, false); await bloom.run(200);
    bloom.button(CC.DELETE, false); await bloom.run(50);
    bloom.step(0); await bloom.run(50); bloom.step(0, false); await bloom.run(50);
    assert.ok(!b.spoken.some(s => s.startsWith('CLEARED')), 'step 1 kept');
    const ctrl = b.controls.slice(-2);
    assert.deepEqual(ctrl, [119, 41], 'Delete held first, then the track');
});

test('Capture keeps steps past the ones it writes and loops just its chords', async () => {
    await save(5);
    await tap(CC.CAPTURE, 50);
    await tap(CC.PLAY, 300);   // stop the preview
    b.spoken.length = 0;
    bloom.button(CC.PLAY); await bloom.run(100);
    assert.ok(b.spoken.some(s => /STEPS 1 TO 4/.test(s)), b.spoken.join(' / '));
    bloom.button(CC.PLAY); await bloom.run(300);
    bloom.step(5); await bloom.run(50);
    assert.match(bloom.text(), /STEP 6/, 'step 6 still saved');
    bloom.step(5, false); await bloom.run(100);
});

test('a step held when Shift+Record starts is let go, and the chords still record', async () => {
    bloom.step(0); await bloom.run(30);
    bloom.button(CC.SHIFT); bloom.button(CC.REC); bloom.button(CC.SHIFT, false);
    bloom.step(0, false);
    b.midi.length = 0;
    const t = Date.now();
    while (Date.now() - t < 10000 && !b.spoken.some(s => /^RECORDED/.test(s))) await bloom.run(20);
    assert.ok(b.midi.some(m => m.on && m.note >= 48), 'chords played');
    assert.equal(b.volumeOwned, 0, 'Volume handed back to Move');
    await bloom.run(300);
});

test('inversions past the 4th have a name', () => {
    assert.equal(voicingLabel({ q: 'maj', ext: ['m7', 'M7', '9', '6'], voicing: 5 }), '5TH INV');
});
