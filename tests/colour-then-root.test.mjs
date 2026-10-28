import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom } from './harness.mjs';

const MAJ7 = 5;
const sounding = bloom => {
    const on = new Map();
    for (const m of bloom.b.midi) on.set(m.note, m.on);
    return [...on].filter(([, v]) => v).map(([n]) => n % 12).sort((x, y) => x - y);
};

for (const [name, sound] of [['plain', 0], ['Hold', 2]]) {
    test(`${name}: holding a colour and then a chord plays that colour, after another chord`, async () => {
        const bloom = await loadBloom({ settings: { mode: 0, bass: false, sound } });
        bloom.pad(0, 0); await bloom.run(40); bloom.pad(0, 0, false); await bloom.run(40);
        bloom.pad(3, MAJ7); await bloom.run(20);
        bloom.pad(0, 3); await bloom.run(40);
        assert.match(bloom.text(), /Fmaj7/);
        bloom.pad(0, 3, false); bloom.pad(3, MAJ7, false); await bloom.run(40);
    });

    test(`${name}: holding a colour and pressing the same chord again plays it coloured`, async () => {
        const bloom = await loadBloom({ settings: { mode: 0, bass: false, sound } });
        bloom.pad(0, 0); await bloom.run(40); bloom.pad(0, 0, false); await bloom.run(40);
        bloom.pad(3, MAJ7); await bloom.run(20);
        bloom.b.midi.length = 0;
        bloom.pad(0, 0); await bloom.run(40);
        assert.match(bloom.text(), /Cmaj7/);
        assert.deepEqual(sounding(bloom), [0, 4, 7, 11], 'Cmaj7 sounding');
        bloom.b.midi.length = 0;
        bloom.pad(0, 0, false); await bloom.run(40);
        if (sound === 2) assert.ok(!bloom.b.midi.some(m => !m.on), 'still ringing in Hold');
        bloom.pad(3, MAJ7, false); await bloom.run(40);
    });
}
