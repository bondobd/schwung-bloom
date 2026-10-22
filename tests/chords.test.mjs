import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, NAMES, padChord, makeProgression, renderChord, varyChord, diatonicQuality, chordName } from '../src/chords.mjs';

const label = c => NAMES[((c.pc % 12) + 12) % 12] + (c.q === 'min' ? 'm' : c.q === 'dim' ? 'dim' : '');
const row = (key, scale, r) => [0, 1, 2, 3, 4, 5, 6, 7].map(col => padChord(key, scale, 0, r, col));

test('C major rows run C to C, lit for the key', () => {
    const majors = row(0, SCALES.major, 0), minors = row(0, SCALES.major, 1);
    assert.deepEqual(majors.map(label), ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
    assert.deepEqual(majors.filter(c => c.inKey).map(label), ['C', 'F', 'G', 'C']);
    assert.deepEqual(minors.filter(c => c.inKey).map(label), ['Dm', 'Em', 'Am', 'Bdim']);
});

test('rows start on the key root and rise', () => {
    const eb = row(3, SCALES.major, 0);
    assert.deepEqual(eb.map(label), ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb']);
    for (let i = 1; i < 8; i++) assert.ok(eb[i].pc > eb[i - 1].pc);
});

test('any scale gets its own chord qualities', () => {
    const q = [0, 2, 3, 5, 7, 8, 11].map(r => diatonicQuality(r, SCALES.harmonicminor));
    assert.deepEqual(q, ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim']);
});

test('generated progressions stay in key, borrowed chords aside', () => {
    for (let i = 0; i < 200; i++) {
        const prog = makeProgression(0, SCALES.major, i % 2 ? 8 : 4);
        assert.equal(prog.length, i % 2 ? 8 : 4);
        const out = prog.filter(c => diatonicQuality(c.pc, SCALES.major) !== c.q);
        assert.ok(out.length <= 1, 'at most one borrowed chord: ' + prog.map(label).join(' '));
    }
});

test('a new take keeps the chord root and base quality', () => {
    const am = renderChord({ pc: 9, q: 'min', ext: [], oct: 0, voicing: 0 });
    for (let i = 0; i < 100; i++) {
        const v = varyChord(am, 0, [60, 64, 67]);
        assert.equal(v.pc, 9);
        assert.equal(v.baseQ, 'min');
        assert.match(v.name, /^A/);
        assert.ok(v.notes.every(n => n >= 0 && n <= 127));
    }
});

test('chord names', () => {
    assert.equal(chordName(7, 'maj', new Set(['m7'])), 'G7');
    assert.equal(chordName(9, 'min', new Set(['m7', '9'])), 'Am9');
    assert.equal(chordName(2, 'sus2', new Set()), 'Dsus2');
    assert.equal(renderChord({ pc: 0, q: 'maj', ext: [], bassDeg: 1 }).name, 'C/E');
});
