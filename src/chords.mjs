/*
 * Bloom chord theory: naming, building, voicing, Key mode.
 * Pure functions, no Schwung bindings, so it can be tested with node.
 */

export const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], sus: [0, 5, 7], sus2: [0, 2, 7], aug: [0, 4, 8] };
export const EXT = { '6': 9, 'm7': 10, 'M7': 11, '9': 14 };

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];

/* Move's scale list (the same as Live's), keyed by lowercase name without spaces. */
export const SCALES = {
    major: MAJOR, minor: MINOR,
    dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10], locrian: [0, 1, 3, 5, 6, 8, 10],
    wholetone: [0, 2, 4, 6, 8, 10], halfwholedim: [0, 1, 3, 4, 6, 7, 9, 10], wholehalfdim: [0, 2, 3, 5, 6, 8, 9, 11],
    minorblues: [0, 3, 5, 6, 7, 10], minorpentatonic: [0, 3, 5, 7, 10], majorpentatonic: [0, 2, 4, 7, 9],
    harmonicminor: [0, 2, 3, 5, 7, 8, 11], harmonicmajor: [0, 2, 4, 5, 7, 8, 11], dorian4: [0, 2, 3, 6, 7, 9, 10],
    phrygiandominant: [0, 1, 4, 5, 7, 8, 10], melodicminor: [0, 2, 3, 5, 7, 9, 11], lydianaugmented: [0, 2, 4, 6, 8, 9, 11],
    lydiandominant: [0, 2, 4, 6, 7, 9, 10], superlocrian: [0, 1, 3, 4, 6, 8, 10], '8tonespanish': [0, 1, 3, 4, 5, 6, 8, 10],
    bhairav: [0, 1, 4, 5, 7, 8, 11], hungarianminor: [0, 2, 3, 6, 7, 8, 11], hirajoshi: [0, 2, 3, 7, 8],
    insen: [0, 1, 5, 7, 10], iwato: [0, 1, 5, 6, 10], kumoi: [0, 2, 3, 7, 9], pelogselisir: [0, 1, 3, 7, 8],
    pelogtembung: [0, 1, 5, 7, 8], messiaen3: [0, 2, 3, 4, 6, 7, 8, 10, 11], messiaen4: [0, 1, 2, 5, 6, 7, 8, 11],
    messiaen5: [0, 1, 5, 6, 7, 11], messiaen6: [0, 2, 4, 5, 6, 8, 10, 11], messiaen7: [0, 1, 2, 3, 5, 6, 7, 8, 9, 11]
};

/* Scale for a name as Move reports it ("Harmonic Minor", "Dorian #4"); null when unknown. */
export function scaleFor(name) {
    const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return SCALES[key] || null;
}

export function chordName(root, q, ext) {
    const h = k => ext.has(k), e6 = h('6'), e7 = h('m7'), eM = h('M7'), e9 = h('9');
    let s;
    if (q === 'min') s = e7 && e9 ? 'm9' : eM && e9 ? 'm(maj9)' : e7 ? 'm7' : eM ? 'm(maj7)' : e6 && e9 ? 'm6/9' : e6 ? 'm6' : e9 ? 'm(add9)' : 'm';
    else if (q === 'dim') s = (e6 ? 'dim7' : e7 ? 'm7b5' : 'dim') + (e9 ? '(add9)' : '');
    else if (q === 'aug') s = 'aug' + (e7 ? '7' : eM ? '(maj7)' : '') + (e9 ? '(add9)' : '');
    else if (q === 'sus2') s = e7 ? '7sus2' : eM ? 'maj7sus2' : e6 ? '6sus2' : 'sus2';
    else if (q === 'sus') s = e7 && e9 ? '9sus4' : e7 ? '7sus4' : eM ? 'maj7sus4' : e9 ? 'sus4(add9)' : e6 ? '6sus4' : 'sus4';
    else s = e7 && e9 ? '9' : eM && e9 ? 'maj9' : e7 ? '7' : eM ? 'maj7' : e6 && e9 ? '6/9' : e6 ? '6' : e9 ? 'add9' : '';
    return NAMES[((root % 12) + 12) % 12] + s;
}

/*
 * Triad quality of a scale degree, built from the notes the scale actually has, or null
 * when rel isn't in the scale. Works for modes, harmonic minor and pentatonics alike.
 */
export function diatonicQuality(rel, scale) {
    const has = i => scale.includes((((rel + i) % 12) + 12) % 12);
    if (!has(0)) return null;
    if (has(4) && has(7)) return 'maj';
    if (has(3) && has(7)) return 'min';
    if (has(3) && has(6)) return 'dim';
    if (has(4) && has(8)) return 'aug';
    if (has(5) && has(7)) return 'sus';
    return has(3) ? 'min' : 'maj';
}

/* Positive v moves the lowest note up an octave v times; negative moves the top note down. */
export function invert(notes, v) {
    const n = notes.slice().sort((a, b) => a - b);
    for (let i = 0; i < Math.abs(v); i++) {
        if (v > 0) n.push(n.shift() + 12); else n.unshift(n.pop() - 12);
        n.sort((a, b) => a - b);
    }
    return n;
}

const center = n => n.reduce((a, b) => a + b, 0) / n.length;

/*
 * Build a chord.
 *   pc      root pitch class (0..12; 12 is the high C pad)
 *   q       'maj' | 'min' | 'dim' | 'sus' | 'sus2' | 'aug'
 *   ext     Set of '6' | 'm7' | 'M7' | '9'
 *   opts    { oct, voicing, prev (notes of previous chord, for smooth voice-leading) }
 */
export function buildChord(pc, q, ext, opts = {}) {
    const oct = opts.oct || 0;
    const iv = [...new Set([...QUAL[q], ...[...ext].map(e => EXT[e])])].sort((a, b) => a - b);
    const base = iv.map(i => 60 + 12 * oct + pc + i);
    let v = opts.voicing || 0;
    if (opts.prev && opts.prev.length) {
        const target = center(opts.prev);
        let best = 0, bestD = Infinity;
        /* Only voicings within a fifth of root position, or chords drift away from the octave. */
        const home = center(base);
        for (let k = -4; k <= 6; k++) {
            const c = center(invert(base, k));
            if (Math.abs(c - home) > 7) continue;
            const d = Math.abs(c - target);
            if (d < bestD) { bestD = d; best = k; }
        }
        v += best;
    }
    const notes = invert(base, v).filter(n => n >= 0 && n <= 127);
    const bass = 36 + 12 * Math.max(-1, Math.min(1, oct)) + (((pc % 12) + 12) % 12);
    return { notes, bass, name: chordName(pc, q, ext), voicing: v };
}

const pcOf = n => ((n % 12) + 12) % 12;
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];

function weighted(rnd, items) {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let r = rnd() * total;
    for (const [v, w] of items) if ((r -= w) < 0) return v;
    return items[items.length - 1][0];
}

function quality(pc, keyRoot, scale) { return diatonicQuality(pc - keyRoot, scale); }

/*
 * The two chord rows run up the key's scale from its root to the octave: majors below,
 * minors above (diminished where the key has it). turn shifts the row by semitones.
 * Roots stay ascending, so a pc may be negative or above 11; use pcOf to compare.
 */
export function padChord(keyRoot, scale, turn, row, col) {
    const base = scale.length === 7 ? scale : (scale.includes(3) && !scale.includes(4) ? MINOR : MAJOR);
    let start = keyRoot + turn;
    if (start > 6) start -= 12;
    if (start < -6) start += 12;
    const pc = start + (col === 7 ? 12 : base[col]);
    const dq = quality(pcOf(pc), keyRoot, scale);
    if (row === 0) return { pc, q: 'maj', inKey: dq === 'maj' };
    return { pc, q: dq === 'dim' ? 'dim' : 'min', inKey: dq === 'min' || dq === 'dim' };
}

/* Scale degrees, 1-based. Common pop, rock and film progressions. */
const MAJOR_PROGS = [
    [1, 5, 6, 4], [6, 4, 1, 5], [1, 6, 4, 5], [1, 4, 6, 5], [4, 1, 5, 6], [2, 5, 1, 6], [3, 6, 1, 5],
    [1, 3, 4, 5], [6, 5, 4, 5], [1, 4, 1, 5], [6, 2, 5, 1], [1, 5, 4, 4], [4, 5, 3, 6], [1, 6, 2, 5],
    [4, 6, 5, 1], [1, 3, 6, 4]
];
const MINOR_PROGS = [
    [1, 6, 3, 7], [1, 4, 7, 3], [1, 7, 6, 7], [1, 6, 4, 5], [1, 4, 5, 1], [6, 7, 1, 1], [1, 3, 7, 6],
    [4, 1, 7, 6], [1, 7, 6, 5], [6, 4, 1, 5], [1, 4, 6, 5], [1, 6, 7, 1]
];

/*
 * A progression of n chords (4 or 8) in the key: [{pc, q}]. Now and then it borrows a chord
 * (iv or bVII in major, a major V in minor), the way songs often do.
 */
export function makeProgression(keyRoot, scale, n, rnd = Math.random) {
    const minor = scale.includes(3) && !scale.includes(4);
    const base = scale.length === 7 ? scale : (minor ? MINOR : MAJOR);
    const progs = minor ? MINOR_PROGS : MAJOR_PROGS;
    const degrees = pick(rnd, progs).slice();
    if (n > 4) {
        const second = rnd() < 0.5 ? degrees.slice() : pick(rnd, progs).slice();
        if (second.join() === degrees.join()) second[3] = pick(rnd, [4, 5, 6].filter(d => d !== degrees[3]));
        degrees.push(...second);
    }
    const chords = degrees.map(d => {
        const pc = pcOf(keyRoot + base[d - 1]);
        return { pc, q: diatonicQuality(base[d - 1], base) || 'maj' };
    });
    if (rnd() < 0.3) {
        const i = 1 + Math.floor(rnd() * (chords.length - 1));
        const rel = pcOf(chords[i].pc - keyRoot);
        if (!minor && rel === 5) chords[i] = { pc: chords[i].pc, q: 'min' };
        else if (!minor && rel === 7) chords[i] = { pc: pcOf(keyRoot + 10), q: 'maj' };
        else if (minor && rel === 7) chords[i] = { pc: chords[i].pc, q: 'maj' };
    }
    return chords;
}

/* Extra colour for a chord, by its base quality. Dominant chords lean toward a 7th. */
function pickColor(q, dominant, rnd) {
    if (q === 'maj') return weighted(rnd, [
        [{ q, ext: [] }, 4], [{ q, ext: ['9'] }, 2], [{ q, ext: ['M7'] }, dominant ? 0.5 : 2], [{ q, ext: ['m7'] }, dominant ? 4 : 0.5],
        [{ q, ext: ['6'] }, 1], [{ q, ext: ['M7', '9'] }, dominant ? 0.3 : 1], [{ q: 'sus2', ext: [] }, 1], [{ q: 'sus', ext: [] }, 1],
        [{ q: 'sus', ext: ['m7'] }, dominant ? 1.5 : 0]
    ]);
    if (q === 'min') return weighted(rnd, [
        [{ q, ext: [] }, 4], [{ q, ext: ['m7'] }, 3], [{ q, ext: ['9'] }, 1], [{ q, ext: ['m7', '9'] }, 1.5], [{ q, ext: ['6'] }, 0.5],
        [{ q: 'sus2', ext: [] }, 0.7]
    ]);
    if (q === 'dim') return weighted(rnd, [[{ q, ext: [] }, 2], [{ q, ext: ['m7'] }, 2]]);
    return { q, ext: [] };
}

/* Notes, bass and name of a stored chord {pc, q, ext, oct, voicing, open, bassDeg}. */
export function renderChord(m) {
    const c = buildChord(m.pc, m.q, new Set(m.ext || []), { oct: m.oct || 0, voicing: m.voicing || 0 });
    let notes = c.notes;
    if (m.open && notes.length > 2) notes = notes.map((n, i) => (i % 2 ? n + 12 : n)).filter(n => n <= 127).sort((a, b) => a - b);
    const deg = QUAL[m.q][m.bassDeg || 0] || 0;
    const bass = 36 + 12 * Math.max(-1, Math.min(1, m.oct || 0)) + pcOf(m.pc + deg);
    return { ...m, notes, bass, name: c.name + (deg ? '/' + NAMES[pcOf(m.pc + deg)] : '') };
}

/* "1ST INV OPEN", for the screen. */
export function voicingLabel(m) {
    const size = new Set([...QUAL[m.q], ...(m.ext || []).map(e => EXT[e])]).size;
    const v = m.voicing || 0, inv = ((v % size) + size) % size, up = Math.floor(v / size);
    const name = inv === 0 ? 'ROOT POS' : (['1ST', '2ND', '3RD'][inv - 1] || inv + 'TH') + ' INV';
    return name + (m.open ? ' OPEN' : '') + (up > 0 ? ' HIGH' : up < 0 ? ' LOW' : '');
}

/* Inversion whose centre is nearest the previous chord's, so chords move smoothly. */
export function smoothVoicing(m, prevNotes) {
    if (!prevNotes || !prevNotes.length) return m.voicing || 0;
    return buildChord(m.pc, m.q, new Set(m.ext || []), { oct: m.oct || 0, prev: prevNotes }).voicing;
}

/*
 * A new take on a chord: colour (7ths, 9ths, sus), inversion, open spread and bass note.
 * The base quality never changes, so variations don't drift away from the progression.
 */
export function varyChord(m, keyRoot, prevNotes, rnd = Math.random) {
    const baseQ = m.baseQ || m.q;
    const color = pickColor(baseQ, pcOf(m.pc - keyRoot) === 7, rnd);
    const next = { ...m, baseQ, q: color.q, ext: color.ext, open: rnd() < 0.25 };
    next.bassDeg = weighted(rnd, [[0, 7], [1, 1.5], [2, 1.5]]);
    if (prevNotes && prevNotes.length) {
        const near = smoothVoicing(next, prevNotes);
        next.voicing = near + weighted(rnd, [[0, 5], [1, 2], [-1, 2]]);
    } else next.voicing = Math.floor(rnd() * 4) - 1;
    return renderChord(next);
}
