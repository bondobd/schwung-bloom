import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const bloom = await loadBloom({ tempo: 480, settings: { mode: 0, sound: 0, chordCh: 2 } });
const { b } = bloom;

test('no track presses while Schwung is not reading Move, and the old selection is not trusted after', async () => {
    await bloom.run(300);
    b.move.invalid = true; b.move.selected = 0; b.controls.length = 0;
    await bloom.run(2000);
    assert.ok(!b.controls.some(c => c >= 40 && c <= 43), 'no track presses: ' + b.controls);
    b.move.invalid = false;
    await bloom.run(600);
    assert.equal(b.move.selected, 2, 'chord track selected again once Move is read');
});
