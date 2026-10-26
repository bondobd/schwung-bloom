import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, bass: false, chordCh: 2, sound: 0 } });
const { b } = bloom;

test('Play right after opening starts the progression even when Schwung says Move is playing', async () => {
    b.move.infoPlaying = 1;
    bloom.button(CC.CAPTURE); await bloom.run(50);
    bloom.button(CC.PLAY); await bloom.run(50);
    b.controls.length = 0; b.midi.length = 0;
    bloom.button(CC.PLAY); await bloom.run(500);
    assert.ok(b.controls.includes(85), 'pressed Move\'s Play');
    assert.equal(b.move.playing, true);
    assert.ok(b.midi.some(m => m.on), 'the progression plays');
    bloom.button(CC.PLAY); await bloom.run(300);
    assert.equal(b.move.playing, false);
    delete b.move.infoPlaying;
});

test('Record takes what you play live onto the chord track; Record again stops', async () => {
    b.controls.length = 0;
    bloom.button(CC.REC); await bloom.run(1500);
    assert.equal(b.move.selected, 2, 'chord track selected');
    assert.ok(b.controls.includes(86), 'pressed Move\'s Record');
    assert.equal(b.move.playing, true);
    assert.match(bloom.text(), /REC LIVE T3/);
    b.midi.length = 0;
    bloom.pad(0, 0); await bloom.run(100);
    for (let c = 0; c < 4; c++) { bloom.pad(2, c); await bloom.run(20); bloom.pad(2, c, false); }
    assert.ok(b.midi.filter(m => m.on).length >= 7, 'chord and strums sent to Move');
    bloom.button(CC.REC); await bloom.run(600);
    assert.equal(b.move.playing, false, 'Move stopped');
    assert.ok(b.spoken.some(s => s.startsWith('RECORDED')), 'said RECORDED: ' + b.spoken.slice(-3));
    assert.deepEqual(bloom.hanging(), [], 'every note let go before Move stopped');
    bloom.pad(0, 0, false); await bloom.run(100);
});
