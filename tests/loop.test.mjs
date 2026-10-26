import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, sound: 0 } });
const { b } = bloom;
const BAR = 500;

test('a new Loop range waits for the next bar, like a clip launch', async () => {
    bloom.button(CC.SHIFT); bloom.button(CC.CAPTURE); bloom.button(CC.SHIFT, false); await bloom.run(100);
    bloom.button(CC.PLAY); await bloom.run(100);
    bloom.button(CC.PLAY); await bloom.run(BAR + 250);
    assert.equal(b.move.playing, true);
    const since = () => (Date.now() - b.move.startedAt) % BAR;
    while (since() < 150 || since() > 250) await bloom.run(5);
    bloom.button(CC.LOOP); bloom.step(4); bloom.step(4, false); bloom.step(7); bloom.step(7, false); bloom.button(CC.LOOP, false);
    const releasedAt = Date.now();
    b.midi.length = 0;
    await bloom.run(BAR);
    const first = b.midi.find(m => m.on);
    assert.ok(first, 'the new range plays');
    assert.ok(first.t - releasedAt > 150, 'not straight away');
    const offBar = (first.t - b.move.startedAt) % BAR;
    assert.ok(offBar < 40 || offBar > BAR - 40, 'on a bar line, ' + offBar + ' ms off');
    bloom.button(CC.PLAY); await bloom.run(200);
});
