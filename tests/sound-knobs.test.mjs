import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBloom, CC } from './harness.mjs';

const KNOB = k => CC.KNOB1 + k - 1;
const shiftTurn = async (bloom, k, detents) => { bloom.button(CC.SHIFT); bloom.turn(KNOB(k), detents); bloom.button(CC.SHIFT, false); await bloom.run(50); };
const onsOf = b => b.midi.filter(m => m.on && m.note >= 48);

test('strum direction: up, down, and alternating', async () => {
    const bloom = await loadBloom({ key: 0, settings: { mode: 1, strumMs: 20, bass: false, sound: 0 } });
    const { b } = bloom;
    const strum = async () => { b.midi.length = 0; bloom.pad(0, 0); await bloom.run(120); bloom.pad(0, 0, false); await bloom.run(40); return onsOf(b).map(m => m.note); };
    const up = await strum();
    assert.deepEqual(up, [...up].sort((x, y) => x - y), 'up: low to high');
    await shiftTurn(bloom, 5, 4);
    const down = await strum();
    assert.deepEqual(down, [...up].reverse(), 'down: high to low');
    await shiftTurn(bloom, 5, 4);
    const a = await strum(), c = await strum();
    assert.notDeepEqual(a, c, 'alternate flips each strum');
});

test('swing makes arp steps long-short', async () => {
    const bloom = await loadBloom({ key: 0, tempo: 120, settings: { mode: 4, rate: 1, bass: false, sound: 0 } });
    const { b } = bloom;
    await shiftTurn(bloom, 6, 20);
    b.midi.length = 0;
    bloom.pad(0, 0); await bloom.run(1100); bloom.pad(0, 0, false); await bloom.run(40);
    const t = onsOf(b).map(m => m.t);
    const gaps = t.slice(1).map((x, i) => x - t[i]);
    assert.ok(gaps.length >= 3, 'some arp notes: ' + gaps);
    assert.ok(gaps[0] > gaps[1] * 1.6, 'long then short at 75%: ' + gaps);
});

test('register keeps pad chords near its pitch', async () => {
    const bloom = await loadBloom({ key: 0, settings: { mode: 0, bass: false, sound: 0, smooth: false } });
    const { b } = bloom;
    const mean = async () => {
        b.midi.length = 0; bloom.pad(0, 7); await bloom.run(40); bloom.pad(0, 7, false); await bloom.run(40);
        const n = onsOf(b).map(m => m.note); return n.reduce((x, y) => x + y, 0) / n.length;
    };
    await shiftTurn(bloom, 7, 4);
    assert.ok(Math.abs(await mean() - 52) <= 6, 'LOW');
    await shiftTurn(bloom, 7, 8);
    assert.ok(Math.abs(await mean() - 67) <= 6, 'HIGH');
});
