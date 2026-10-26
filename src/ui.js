/*
 * Bloom: an Orchid-style chord instrument for Ableton Move (Schwung overtake module).
 *
 * Chords go to Move Track 3 and the optional bass to Track 2 by default (Track 1 is
 * drums in a new Set), injected on cable 2 so Move's own instruments play them.
 * Routing follows each track's MIDI In setting (Shift+Track button on Move): a track on
 * a fixed channel gets that channel; a track on Auto only hears MIDI while selected, so
 * Bloom selects the chord track by pressing its Track button for you.
 *
 * Pads, bottom row first (pad 68 is bottom-left):
 *   row 1  major chords on the key's scale, root to octave (C D E F G A B C in C major)
 *   row 2  minor chords on the same roots (diminished where the key has it)
 *   row 3  strum plate: tones of the held chord, low to high (dark when no chord is held)
 *   row 4  Sus2 Sus4 Dim Aug | 7 Maj7 6 Add9   hold while playing a chord
 * Shift+Loop switches to pick-then-strike: a chord pad picks the chord silently and the top
 *   row plays it: Plain Sus2 Sus4 6 | 7 Maj7 Add9 9. Top-row pads that keep the chord in key
 *   are violet (Plain white); dim red ones add notes outside the key. The strum row stays on the
 *   last picked or struck chord, so you can let go and keep playing its notes.
 * Chords in the Set's key are lit; Shift+jog click toggles playing the others too.
 * Steps: chord memories, kept per Move Set. Shift+step saves the last chord, step plays it,
 *        Delete+step clears, Undo takes back the last change.
 * Capture: new 4-chord progression in the key (Shift+Capture: 8).
 * Play: starts Move and the progression (the Loop range) together, locked to Move's clock;
 *   again to stop. Shift+Play: the same with every step.
 * Loop: hold it and tap the first and last step to play only those; tap Loop alone for all steps.
 * Buttons follow Move's own conventions:
 *   -/+          octave (Shift: move the chord rows by a semitone)
 *   Left/Right   previous/next chord of the progression (jumps the player, or auditions it)
 *   hold a step  knobs set how it plays (first value DEFAULT follows the global knob),
 *                -/+ transposes it a semitone (long press: an octave), Volume sets its volume,
 *                the wheel or Left/Right gives a new take on the chord, wheel click makes it plain
 * Wheel with nothing held: a new take on every chord. While playing a chord pad, it inverts it.
 * Delete+chord pad: stop a held chord. Shift+Delete: all notes off. Shift+knob 8: pad colours.
 * Track buttons, as on Move: hold + Volume knob = track volume, Mute + track = mute,
 *   Delete + track = delete that track's playing clip, Shift+Undo = Move's Undo.
 * Record: records the steps onto the chord track, then the bass onto the bass track.
 * Knobs (touch one to see it on screen):
 *   1 play mode   2 step length  3 strum speed or arp rate  4 sound: on / muted / hold
 *   5 volume      6 bass on/off  7 spread                   8 feel (velocity spread)
 *   Shift+5 chord track, Shift+6 bass track.
 * Shift+Vol+Jog click exits.
 */

import { setLED, setButtonLED, decodeDelta, isNoiseMessage, invalidateLedCache } from '/data/UserData/schwung/shared/input_filter.mjs';
import { announce } from '/data/UserData/schwung/shared/screen_reader.mjs';
import {
    NAMES, QUAL, EXT, MAJOR, scaleFor, padChord, makeProgression, renderChord, varyChord,
    smoothVoicing, voicingLabel
} from './chords.mjs';

const PAD0 = 68, STEP0 = 16;
const CC_JOG = 14, CC_JOG_CLICK = 3, CC_KNOB1 = 71, CC_KNOB8 = 78;
const CC_SHIFT = 49, CC_DELETE = 119, CC_UNDO = 56, CC_LOOP = 58, CC_CAPTURE = 52;
const CC_DOWN = 54, CC_UP = 55, CC_LEFT = 62, CC_RIGHT = 63, CC_PLAY = 85, CC_REC = 86, CC_VOLUME = 79, CC_MUTE = 88;
const OUT_PER_TICK = 6;
const LONG_PRESS_MS = 450;
const BIG_FONT = '/data/UserData/schwung/host/fonts/tamzen-20.png';
const DEFAULT_FONT = '/data/UserData/schwung/host/font.png';
const STATE_DIR = '/data/UserData/schwung/config/bloom';
const ACTIVE_SET = '/data/UserData/schwung/active_set.txt';
const SETS_DIR = '/data/UserData/UserLibrary/Sets';
const CC_TRACK1 = 43;          // Track buttons are CC 43 (Track 1) down to CC 40 (Track 4)
const LEDS_PER_TICK = 8;
const TOAST_MS = 1400;
const SETTINGS_VERSION = 3;

const COL = {
    off: 0, white: 120, grey: 118, dgrey2: 124,
    violet: 19, dviolet: 101, vdviolet: 102,
    maj: 3, majOut: 68, min: 15, minOut: 94, held: 126, clash: 65, dclash: 66,
    mem: 95, memOn: 16, memSlot: 124, loop: 3, rec: 127
};

/*
 * Pad colour themes (Shift+-/+). maj/min: in-key chord pads; majOut/minOut: out-of-key ones when
 * playable; held: the sounding chord; strum: strum-plate tones; type/typeDim/typeIdle: top row
 * in key (held, available, nothing to modify); clash/dclash: top row taking the chord out of key.
 */
const THEMES = [
    { name: 'OCEAN', maj: 14, min: 17, majOut: 92, minOut: 98, held: 120, grey: 119,
      violet: 16, dviolet: 95, vdviolet: 96, clash: 24, dclash: 112 },
    { name: 'MOONLIGHT', maj: 120, min: 118, majOut: 123, minOut: 124, held: 16, grey: 119,
      violet: 118, dviolet: 119, vdviolet: 124, clash: 5, dclash: 74 },
    { name: 'SUNSET', maj: 5, min: 24, majOut: 74, minOut: 112, held: 120, grey: 119,
      violet: 4, dviolet: 71, vdviolet: 72, clash: 18, dclash: 100 },
    { name: 'CLASSIC', maj: 3, min: 15, majOut: 68, minOut: 94, held: 126, grey: 118,
      violet: 19, dviolet: 101, vdviolet: 102, clash: 65, dclash: 66 }
];

function applyTheme() {
    cfg.theme = clamp(cfg.theme, 0, THEMES.length - 1);
    const { name, ...colors } = THEMES[cfg.theme];
    Object.assign(COL, colors);
    ledShown.fill(-1);
}
const MODES = ['CHORD', 'STRUM', 'STRUM 2OCT', 'SLOP', 'ARP UP', 'ARP UP/DN', 'PULSE'];
const M_CHORD = 0, M_STRUM = 1, M_STRUM2 = 2, M_SLOP = 3, M_ARP = 4, M_ARP2 = 5, M_PULSE = 6;
const RATES = [['1/4', 1], ['1/8', 0.5], ['1/8T', 1 / 3], ['1/16', 0.25]];
const SOUNDS = ['ON', 'MUTED', 'HOLD'];
const S_ON = 0, S_MUTED = 1, S_HOLD = 2;
const SPREADS = ['CLOSE', 'OPEN', 'WIDE'];
const OUTS = ['MOVE', 'MOVE + USB', 'USB'];
const OUT_MOVE = 0, OUT_USB = 2;
const STEP_BEATS = [1, 2, 3, 4, 6, 8, 12, 16];
const KNOB_NAMES = ['PLAY MODE', 'STEP LENGTH', 'SPEED', 'SOUND', 'VOLUME', 'BASS', 'SPREAD', 'FEEL'];
const SHORT_MODES = ['CHORD', 'STRUM', 'STRUM2', 'SLOP', 'ARP UP', 'ARP UD', 'PULSE'];
const GATES = [0.25, 0.5, 0.75, 1];
const TYPES = [['q', 'sus2', 'SUS2'], ['q', 'sus', 'SUS4'], ['q', 'dim', 'DIM'], ['q', 'aug', 'AUG'],
    ['e', 'm7', '7'], ['e', 'M7', 'MAJ7'], ['e', '6', '6'], ['e', '9', 'ADD9']];
const PLAYER_PAD = 64;
const STRIKES = [
    { label: 'PLAIN', ext: [] }, { label: 'SUS2', q: 'sus2', ext: [] }, { label: 'SUS4', q: 'sus', ext: [] }, { label: '6', ext: ['6'] },
    { label: '7', ext: ['m7'] }, { label: 'MAJ7', ext: ['M7'] }, { label: 'ADD9', ext: ['9'] }, { label: '9', ext: ['m7', '9'] }
];

/* Saved between sessions. */
const cfg = {
    v: SETTINGS_VERSION, mode: M_STRUM, strumMs: 35, rate: 1, bass: false, chordCh: 2, bassCh: 1,
    smooth: true, spread: 0, feel: 0, sound: S_ON, keyLock: true, vol: 100, beats: 0, strike: false, theme: 0, out: OUT_MOVE
};

const st = {
    oct: 0, voicing: 0,
    keyRoot: 0, scale: MAJOR, scaleName: 'MAJOR', turn: 0,
    tempo: 120, beatsPerBar: 4, tracks: [],
    heldTypes: [],              // type-pad columns in press order
    rootPad: -1, rootDown: false, latched: false,
    notes: [], bassNote: -1, name: '--', prev: null, cur: null,
    last: null,                 // last chord played, for Shift+step
    sounding: new Map(),        // pad key -> [{ch, note, on}]
    queue: [],                  // pending note-ons {at, pad, ch, note, vel, entry}
    arp: null,                  // {pad, base, notes, ch, vel, i, dir, next, on, offAt}
    player: null,               // a run (see newRun) plus waiting/linked/startBy for Play
    clock: undefined,           // {beat, at} from the DSP; null when it doesn't answer
    playingSince: 0, clockOffSince: 0, infoStuck: false,
    range: null,                // {a, b}: steps the progression plays, null for all
    loopHeld: false, loopPicks: [],
    sel: null,                  // pick-then-strike: {pad, pc, q} of the picked chord
    armNotes: [],               // pick-then-strike: what the strum row plays after the pads are released
    bounce: null,               // recording onto Move tracks, see tickBounce
    heldStep: -1, movePlaying: false, homeTrack: -1,
    shift: false, del: false,
    mems: new Array(16).fill(null), undo: [], memsAt: 0, setId: '',
    takes: [], stepTakes: [],   // earlier versions, for turning the wheel back
    toast: null,                // {title, value, until}
    knobAcc: [0, 0, 0, 0, 0, 0, 0, 0],
    inModes: [], selTrack: -1,  // per track: 'auto' | 'none' | channel 0-15, from the Set file
    controlQueue: [], controlAt: 0,
    out: [], live: new Set(), recheck: [],  // paced MIDI out, notes Move is sounding, note-offs to repeat
    usbOut: [], usbLive: new Set(),         // the same for the USB-A port
    plusMinus: null,            // {dir, at, fired}: a -/+ press on a held step, for long press
    navStep: -1,
    mute: false,
    trackHeld: -1, trackPressed: false,  // a track button held in Bloom, and whether Move has been sent its press
    select: { target: -1, tries: 0, at: 0 },
    dirty: true, ticks: 0, btnLeds: {}
};
const ledShown = new Array(48).fill(-1);
let bigFont = false;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------- storage ---------- */

function readJson(path) {
    try {
        const raw = typeof host_read_file === 'function' ? host_read_file(path) : null;
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function writeJson(path, obj) {
    try {
        if (typeof host_write_file !== 'function') return;
        if (typeof host_ensure_dir === 'function') host_ensure_dir(STATE_DIR);
        host_write_file(path, JSON.stringify(obj));
    } catch (e) { console.log('bloom: save failed ' + e); }
}

function loadState() {
    const saved = readJson(STATE_DIR + '/settings.json');
    if (saved && saved.v === SETTINGS_VERSION)
        for (const k of Object.keys(cfg)) if (typeof saved[k] === typeof cfg[k]) cfg[k] = saved[k];
    cfg.mode = clamp(cfg.mode, 0, MODES.length - 1);
    cfg.sound = clamp(cfg.sound, 0, SOUNDS.length - 1);
    cfg.spread = clamp(cfg.spread, 0, SPREADS.length - 1);
    cfg.vol = clamp(cfg.vol, 0, 100);
    cfg.out = clamp(cfg.out, 0, OUTS.length - 1);
    loadMems();
}

function saveSettings() { writeJson(STATE_DIR + '/settings.json', cfg); }

function currentSetId() {
    try {
        const raw = typeof host_read_file === 'function' ? host_read_file(ACTIVE_SET) : null;
        const id = raw ? raw.split('\n')[0].trim() : '';
        return /^[0-9a-f-]{8,}$/i.test(id) ? id : 'default';
    } catch (e) { return 'default'; }
}

function loadMems() {
    st.setId = currentSetId();
    const saved = readJson(STATE_DIR + '/set-' + st.setId + '.json');
    st.mems = new Array(16).fill(null);
    st.undo = []; st.takes = []; st.stepTakes = [];
    st.range = saved && saved.range && saved.range.a >= 0 && saved.range.b < 16 ? saved.range : null;
    if (saved && Array.isArray(saved.mems)) saved.mems.slice(0, 16).forEach((m, i) => { if (m && Array.isArray(m.notes)) st.mems[i] = repairMem(m); });
}

/*
 * `bass` is a step's bass note. Bloom 0.9 also stored the step's bass on/off setting there,
 * which made every saved step play bass and could replace the note with true/false.
 */
function repairMem(m) {
    if (typeof m.bass === 'number' && m.bassOn !== undefined) return m;
    const fixed = { ...m };
    if (typeof m.bass === 'boolean') fixed.bassOn = m.bass;
    if (typeof fixed.bass !== 'number') fixed.bass = renderChord(fixed).bass;
    return fixed;
}

function saveMems() { st.memsAt = 0; writeJson(STATE_DIR + '/set-' + st.setId + '.json', { mems: st.mems, range: st.range }); }

function editMems(fn) {
    st.undo.push(st.mems.slice());
    if (st.undo.length > 30) st.undo.shift();
    fn();
    st.memsAt = Date.now();
    st.dirty = true;
}

function memOrder() { return st.mems.map((m, i) => (m ? i : -1)).filter(i => i >= 0); }

/* The steps the progression plays: every saved step, or those in the Loop range. */
function playOrder() {
    const all = memOrder();
    if (!st.range) return all;
    const inRange = all.filter(s => s >= st.range.a && s <= st.range.b);
    return inRange.length ? inRange : all;
}

function inRange(s) { return !st.range || (s >= st.range.a && s <= st.range.b); }

/* ---------- routing to Move tracks ---------- */

function readInputModes() {
    try {
        const raw = typeof host_read_file === 'function' ? host_read_file(ACTIVE_SET) : null;
        const [id, name] = raw ? raw.split('\n').map(x => x.trim()) : [];
        const song = id && name ? host_read_file(SETS_DIR + '/' + id + '/' + name + '/Song.abl') : null;
        if (!song) { st.inModes = []; return; }
        const modes = [];
        const re = /"midiInputMode"\s*:\s*("auto"|\[[^\]]*\])/g;
        let m;
        while ((m = re.exec(song)) && modes.length < 4) {
            if (m[1] === '"auto"') modes.push('auto');
            else {
                const n = parseInt(m[1].replace(/[^0-9]/g, ''), 10);
                modes.push(isNaN(n) ? 'none' : clamp(n, 0, 15));
            }
        }
        st.inModes = modes;
    } catch (e) { st.inModes = []; }
}

/* How to reach a track: its fixed channel, or Auto (needs selecting) on a channel no other track claims. */
function route(track) {
    const mode = st.inModes[track];
    if (typeof mode === 'number') return { ch: mode, auto: false, off: false };
    if (mode === 'none') return { ch: track, auto: false, off: true };
    const claimed = st.inModes.filter(x => typeof x === 'number');
    let ch = track;
    if (claimed.includes(ch)) for (ch = 0; ch < 16 && claimed.includes(ch); ch++);
    return { ch, auto: true, off: false };
}

function chordRoute() { return route(cfg.chordCh); }

/* Only the selected track hears Auto, so bass for another Auto track plays on the chord track instead. */
/* cfg.bassCh is a track, or -1 for the chord track itself. */
function bassOnChords() { return cfg.bassCh < 0 || cfg.bassCh === cfg.chordCh; }

/* Where Record puts the bass: always its own track when it has one, Auto or not. */
function bassRecordRoute() { return bassOnChords() ? chordRoute() : route(cfg.bassCh); }

function bassRoute() {
    if (bassOnChords()) return { ...chordRoute(), onChords: true };
    const r = route(cfg.bassCh);
    if (r.auto && cfg.out !== OUT_USB) return { ...chordRoute(), onChords: true, needsSetup: true };
    return r;
}

function selectedTrack() {
    const i = st.tracks.findIndex(t => t && t.selected);
    return i >= 0 ? i : st.selTrack;
}

function pressButton(cc) { st.controlQueue.push([0x0b, 0xb0, cc, 127], [0x0b, 0xb0, cc, 0]); }

/* Press the chord track's Track button on Move when it is on Auto and not selected. */
function requestSelect() { st.select = { target: cfg.chordCh, tries: 0, at: 0 }; }

function tickSelect() {
    const s = st.select;
    if (st.bounce || s.target < 0 || !chordRoute().auto) return;
    const now = Date.now();
    if (selectedTrack() === s.target || s.tries >= 3 || now < s.at) return;
    pressButton(CC_TRACK1 - s.target);
    s.tries++;
    s.at = now + 1500;
}

/* Control presses go out one per 50 ms so Move sees press and release separately. */
function flushControls() {
    if (!st.controlQueue.length || Date.now() < st.controlAt) return;
    move_midi_inject_to_move(st.controlQueue.shift());
    st.controlAt = Date.now() + 50;
}

/* ---------- MIDI out ---------- */

/*
 * Schwung's inject ring silently drops packets when full, and it holds them back after every
 * pad, button or knob event, so notes go out a few per tick and every note-off is repeated
 * once shortly after unless the note has started again. A lost note-off would hang the note.
 */
/* Record always goes to Move, since that is where the clips are made. */
function toMove() { return cfg.out !== OUT_USB || !!st.bounce; }
function toUsb() { return cfg.out !== OUT_MOVE; }

/* External gear hears chords on channel 1 and bass on its own track on channel 2. */
function usbChannel(ch) { return ch === chordRoute().ch ? 0 : 1; }

function noteOn(ch, note, vel) {
    if (toMove()) { st.live.add(ch * 128 + note); st.out.push([0x29, 0x90 | ch, note, vel]); }
    if (toUsb()) { st.usbLive.add(ch * 128 + note); st.usbOut.push([0x09, 0x90 | usbChannel(ch), note, vel]); }
}

function noteOff(ch, note) {
    const key = ch * 128 + note;
    if (st.usbLive.delete(key)) st.usbOut.push([0x08, 0x80 | usbChannel(ch), note, 0]);
    if (!st.live.delete(key) && !toMove()) return;
    st.out.push([0x28, 0x80 | ch, note, 0]);
    st.recheck.push({ at: Date.now() + 150, ch, note });
}

/* The USB port says when it is full, so a refused packet waits for the next tick instead of being lost. */
function flushUsb() {
    if (typeof move_midi_external_send !== 'function') { st.usbOut = []; return; }
    for (let n = 0; n < OUT_PER_TICK && st.usbOut.length; n++) {
        if (move_midi_external_send(st.usbOut[0]) === false) return;
        st.usbOut.shift();
    }
}

function flushOut() {
    const now = Date.now();
    if (st.recheck.length && st.recheck[0].at <= now) {
        const due = st.recheck.filter(r => r.at <= now);
        st.recheck = st.recheck.filter(r => r.at > now);
        for (const r of due) if (!st.live.has(r.ch * 128 + r.note)) st.out.push([0x28, 0x80 | r.ch, r.note, 0]);
    }
    for (let n = 0; n < OUT_PER_TICK && st.out.length; n++) move_midi_inject_to_move(st.out.shift());
    flushUsb();
}

/* Shift+Delete: every note off on the chord and bass channels, in case anything still hangs. */
function panic() {
    allNotesOff();
    stopHeld();
    st.player = null;
    const chans = [...new Set([chordRoute().ch, bassRoute().ch, bassRecordRoute().ch])];
    for (const ch of chans) {
        st.out.push([0x2b, 0xb0 | ch, 123, 0]);
        for (let n = 0; n < 128; n++) st.out.push([0x28, 0x80 | ch, n, 0]);
    }
    if (toUsb()) for (const ch of [0, 1]) st.usbOut.push([0x0b, 0xb0 | ch, 123, 0]);
    st.live.clear();
    st.usbLive.clear();
    toast('ALL NOTES OFF', 'CH ' + chans.map(c => c + 1).join(' + ') + (toUsb() ? ' + USB' : ''));
}

function releasePad(pad) {
    st.queue = st.queue.filter(e => e.pad !== pad);
    const list = st.sounding.get(pad);
    if (list) list.forEach(n => { if (n.on) noteOff(n.ch, n.note); });
    st.sounding.delete(pad);
    if (st.arp && st.arp.pad === pad) stopArp();
}

function allNotesOff() {
    st.queue = [];
    stopArp();
    for (const pad of [...st.sounding.keys()]) releasePad(pad);
}

/* How a chord is played: the global knobs, overridden by whatever a step sets for itself. */
function perfFor(m) {
    const own = k => (m && m[k] != null ? m[k] : null);
    return {
        mode: own('mode') ?? cfg.mode, rate: own('rate') ?? cfg.rate, strumMs: own('strumMs') ?? cfg.strumMs,
        spread: own('spread') ?? cfg.spread, feel: own('feel') ?? cfg.feel, bass: own('bassOn') ?? cfg.bass,
        gate: own('gate') ?? 1, vol: (own('vol') ?? 100) * cfg.vol / 10000
    };
}

function feelVel(vel, perf) {
    const v = vel * perf.vol;
    if (!perf.feel) return clamp(Math.round(v), 1, 127);
    const spread = perf.feel / 10;
    return clamp(Math.round(v * (1 - spread * 0.35 + Math.random() * spread * 0.45)), 1, 127);
}

/* Note-ons go through the queue so Strum and Slop can spread them out. */
function playNotes(pad, notes, vel, ch, spread, perf) {
    const now = Date.now();
    const list = st.sounding.get(pad) || [];
    notes.forEach((note, i) => {
        let dt = 0, v = feelVel(vel, perf);
        if (spread && (perf.mode === M_STRUM || perf.mode === M_STRUM2)) dt = i * perf.strumMs;
        else if (spread && perf.mode === M_SLOP) { dt = Math.random() * 45; v = clamp(Math.round(v * (0.75 + Math.random() * 0.4)), 1, 127); }
        const entry = { ch, note, on: false };
        st.queue.push({ at: now + dt, pad, ch, note, vel: v, entry });
        list.push(entry);
    });
    st.sounding.set(pad, list);
}

function flushQueue() {
    if (!st.queue.length) return;
    const now = Date.now();
    const due = st.queue.filter(e => e.at <= now);
    if (!due.length) return;
    st.queue = st.queue.filter(e => e.at > now);
    due.forEach(e => { noteOn(e.ch, e.note, e.vel); e.entry.on = true; });
}

/* ---------- arp and pulse, on Move's tempo ---------- */

function beatMs() { return 60000 / Math.max(20, st.tempo); }
function stepMs(perf) { return beatMs() * RATES[perf.rate][1]; }
function isArpMode(perf = cfg) { return perf.mode >= M_ARP; }

function arpNotes(notes, perf) {
    const out = [];
    for (let o = 0; o <= perf.spread; o++) notes.forEach(n => { if (n + 12 * o <= 127) out.push(n + 12 * o); });
    return out;
}

/* `bass` ({ch, note}) pulses along with the chord in Pulse, so the bass drives with it. */
function startArp(pad, notes, vel, ch, perf, bass = null) {
    stopArp();
    st.arp = { pad, base: notes, notes: arpNotes(notes, perf), ch, vel, perf, bass, bassOn: false, i: 0, dir: 1, next: Date.now(), on: [], offAt: 0 };
}

function arpOff(a) {
    a.on.forEach(n => noteOff(a.ch, n));
    a.on = [];
    if (a.bassOn) { noteOff(a.bass.ch, a.bass.note); a.bassOn = false; }
}

function stopArp() {
    if (!st.arp) return;
    arpOff(st.arp);
    st.arp = null;
}

function tickArp() {
    const a = st.arp;
    if (!a) return;
    const now = Date.now();
    if ((a.on.length || a.bassOn) && a.offAt && now >= a.offAt) arpOff(a);
    if (now < a.next) return;
    arpOff(a);
    const len = stepMs(a.perf);
    if (a.perf.mode === M_PULSE) {
        a.on = a.base.slice();
        a.on.forEach(n => noteOn(a.ch, n, feelVel(a.vel, a.perf)));
        if (a.bass) { noteOn(a.bass.ch, a.bass.note, feelVel(a.vel, a.perf)); a.bassOn = true; }
        a.offAt = now + len * 0.55;
    } else {
        const n = a.notes[a.i % a.notes.length];
        noteOn(a.ch, n, feelVel(a.vel, a.perf));
        a.on = [n];
        a.offAt = now + len * 0.9;
        if (a.perf.mode === M_ARP2 && a.notes.length > 1) {
            if (a.i + a.dir >= a.notes.length || a.i + a.dir < 0) a.dir = -a.dir;
            a.i += a.dir;
        } else a.i = (a.i + 1) % a.notes.length;
    }
    /* Catch up without bursting if a tick ran late. */
    a.next += len;
    if (a.next < now) a.next = now + len;
}

/* ---------- chords ---------- */

function padInfo(row, col) { return padChord(st.keyRoot, st.scale, st.turn, row, col); }
const pcOf = n => ((n % 12) + 12) % 12;

function heldTypeValues() {
    const qs = st.heldTypes.filter(c => TYPES[c][0] === 'q');
    return {
        q: qs.length ? TYPES[qs[qs.length - 1]][1] : null,
        ext: st.heldTypes.filter(c => TYPES[c][0] === 'e').map(c => TYPES[c][1])
    };
}

/* Open moves every other note up an octave; wide also lifts the top note again. */
function spreadNotes(notes, perf) {
    if (perf.spread === 0 || isArpMode(perf)) return notes;
    const out = notes.map((n, i) => (i % 2 ? n + 12 : n));
    if (perf.spread === 2) out[out.length - 1] += 12;
    return out.filter(n => n <= 127).sort((a, b) => a - b);
}

/* Sound a chord (from a chord pad, a step or the player) and make it the held chord. */
function soundChord(pad, c, vel, perf = perfFor(null)) {
    if (st.rootPad !== pad && (st.rootDown || st.latched)) releasePad(st.rootPad);
    releasePad(pad);
    st.rootPad = pad; st.rootDown = true; st.latched = false;
    const notes = spreadNotes(c.notes, perf);
    st.notes = notes; st.bassNote = c.bass; st.name = c.name; st.prev = c.notes;
    st.cur = { pc: c.pc, q: c.baseQ || c.q };
    st.bassOn = perf.bass;
    const parts = st.bounce ? st.bounce.parts : { chords: true, bass: true };
    if (cfg.sound !== S_MUTED) {
        const ch = chordRoute().ch;
        const route = st.bounce ? bassRecordRoute() : bassRoute();
        const bass = parts.bass && perf.bass && !route.off ? { ch: route.ch, note: c.bass } : null;
        if (perf.mode === M_PULSE && (parts.chords || bass)) startArp(pad, parts.chords ? notes : [], vel, ch, perf, bass);
        else {
            if (parts.chords) {
                if (isArpMode(perf)) startArp(pad, notes, vel, ch, perf);
                else playNotes(pad, perf.mode === M_STRUM2 ? notes.concat(notes.map(n => n + 12).filter(n => n <= 127)) : notes, vel, ch, true, perf);
            }
            if (bass) playNotes(pad, [bass.note], vel, bass.ch, false, perf);
        }
    }
    st.dirty = true;
}

/* A released chord keeps ringing in Hold, until the next chord or the same pad again. */
function releaseChord(pad) {
    if (pad !== st.rootPad || !st.rootDown) { releasePad(pad); st.dirty = true; return; }
    if (cfg.sound === S_HOLD) { st.latched = true; st.dirty = true; return; }
    st.rootDown = false;
    releasePad(pad);
    st.dirty = true;
}

function stopHeld() {
    if (st.rootPad >= 0) releasePad(st.rootPad);
    st.rootDown = false; st.latched = false;
    st.dirty = true;
}

function playChordPad(i, vel) {
    if (st.latched && i === st.rootPad) { stopHeld(); return; }
    const p = padInfo(i >> 3, i & 7);
    if (cfg.keyLock && !p.inKey) return;
    const t = heldTypeValues();
    const m = { pc: p.pc, baseQ: p.q, q: t.q || p.q, ext: t.ext, oct: st.oct, voicing: st.voicing, open: false, bassDeg: 0 };
    if (cfg.smooth && st.prev) m.voicing = smoothVoicing(m, st.prev);
    const c = renderChord(m);
    st.last = c;
    soundChord(i, c, vel);
}

/* Rebuild the held pad chord after a type pad, inversion, octave or spread change. */
function replayHeld() {
    const strikePad = cfg.strike && st.rootPad >= 24 && st.rootPad < 32;
    if (st.rootDown && (st.rootPad < 16 || strikePad)) {
        const latched = st.latched;
        st.latched = false;
        st.prev = null;
        if (strikePad) strike(st.rootPad, 100); else playChordPad(st.rootPad, 100);
        st.latched = latched;
    }
    st.dirty = true;
}

/* The strum row plays the sounding chord; in pick-then-strike it stays on the last picked or struck chord. */
function strumTones() {
    if (st.rootDown && st.notes.length) return st.notes;
    return cfg.strike ? st.armNotes : [];
}

/* True when every note of the chord is in the Set's scale. */
function chordInKey(pc, q, ext) {
    return [...QUAL[q], ...ext.map(e => EXT[e])].every(i => st.scale.includes(pcOf(pc + i - st.keyRoot)));
}

function strikeShape(col) {
    const v = STRIKES[col], q = st.sel.q === 'dim' && v.q ? 'dim' : (v.q || st.sel.q);
    return { q, ext: v.ext };
}

function pick(i) {
    const p = padInfo(i >> 3, i & 7);
    if (cfg.keyLock && !p.inKey) return;
    st.sel = { pad: i, pc: p.pc, q: p.q };
    const plain = renderChord({ pc: p.pc, q: p.q, ext: [], oct: st.oct, voicing: st.voicing });
    st.name = plain.name + ' ?';
    st.armNotes = spreadNotes(plain.notes, perfFor(null));
    st.dirty = true;
}

/* Top-row pad in pick-then-strike: play the picked chord in that pad's voicing. */
function strike(i, vel) {
    if (!st.sel) { toast('PICK A CHORD', 'THEN STRIKE THE TOP ROW'); return; }
    if (st.latched && i === st.rootPad) { stopHeld(); return; }
    const shape = strikeShape(i & 7);
    const m = { pc: st.sel.pc, baseQ: st.sel.q, q: shape.q, ext: shape.ext, oct: st.oct, voicing: st.voicing, open: false, bassDeg: 0 };
    if (cfg.smooth && st.prev) m.voicing = smoothVoicing(m, st.prev);
    const c = renderChord(m);
    st.last = c;
    soundChord(i, c, vel);
    st.armNotes = st.notes;
}

/* ---------- steps: chord memories ---------- */

function memBeats(m) { return (m && m.beats) || cfg.beats || st.beatsPerBar; }

function beatsLabel(b) {
    if (b % st.beatsPerBar === 0) { const bars = b / st.beatsPerBar; return bars + (bars === 1 ? ' BAR' : ' BARS'); }
    return b + (b === 1 ? ' BEAT' : ' BEATS');
}

function nextBeats(cur, dir) {
    let i = STEP_BEATS.findIndex(b => b >= cur);
    if (i < 0) i = STEP_BEATS.length - 1;
    else if (STEP_BEATS[i] !== cur && dir < 0) i++;
    return STEP_BEATS[clamp(i + dir, 0, STEP_BEATS.length - 1)];
}

/* The chord before step s in playing order, for smooth voice-leading. */
function prevNotes(s) {
    const order = memOrder(), i = order.indexOf(s);
    if (i <= 0) return null;
    return st.mems[order[i - 1]].notes;
}

function setStep(s, m, title, value) {
    editMems(() => { st.mems[s] = m; });
    if (st.heldStep === s) soundChord(32 + s, m, 100, perfFor(m));
    else toast(title || 'STEP ' + (s + 1) + ': ' + voicingLabel(m), value || m.name);
}

function stepDown(s, vel) {
    if (st.loopHeld) { st.loopPicks.push(s); st.dirty = true; return; }
    if (st.del) {
        if (st.mems[s]) { editMems(() => { st.mems[s] = null; }); toast('CLEARED', 'STEP ' + (s + 1)); }
        return;
    }
    if (st.shift) {
        if (!st.last) { toast('NOTHING YET', 'PLAY A CHORD'); return; }
        const chord = { ...st.last, beats: (st.mems[s] && st.mems[s].beats) || undefined };
        editMems(() => { st.mems[s] = chord; });
        st.stepTakes[s] = [];
        toast('SAVED ' + (s + 1), chord.name);
        return;
    }
    const m = st.mems[s];
    if (!m) return;
    st.heldStep = s;
    ownVolumeKnob(true);
    if (st.latched && st.rootPad === 32 + s) { stopHeld(); return; }
    soundChord(32 + s, m, vel, perfFor(m));
}

function stepUp(s) {
    if (st.heldStep === s) { st.heldStep = -1; st.dirty = true; ownVolumeKnob(false); }
    releaseChord(32 + s);
}

/* Wheel on a held step: right is a new take on the chord, left goes back through earlier takes. */
function turnStep(s, dir) {
    const m = st.mems[s];
    if (!m) return;
    const takes = st.stepTakes[s] || (st.stepTakes[s] = []);
    if (dir > 0) {
        takes.push(m);
        if (takes.length > 40) takes.shift();
        setStep(s, varyChord(m, st.keyRoot, prevNotes(s)));
    } else if (takes.length) setStep(s, takes.pop());
    else toast('STEP ' + (s + 1), 'FIRST TAKE');
}

function plainStep(s) {
    const m = st.mems[s];
    if (!m) return;
    const plain = { ...m, q: m.baseQ || m.q, ext: [], open: false, bassDeg: 0, voicing: 0 };
    plain.voicing = smoothVoicing(plain, prevNotes(s));
    (st.stepTakes[s] || (st.stepTakes[s] = [])).push(m);
    setStep(s, renderChord(plain), 'STEP ' + (s + 1) + ': PLAIN');
}

/* Wheel with nothing held: a new take on every chord, voice-led from one to the next. */
function turnAll(dir) {
    const order = playOrder();
    if (!order.length) return false;
    if (dir > 0) {
        st.takes.push(st.mems.slice());
        if (st.takes.length > 40) st.takes.shift();
        editMems(() => {
            let prev = null;
            for (const s of order) { st.mems[s] = varyChord(st.mems[s], st.keyRoot, prev); prev = st.mems[s].notes; }
        });
    } else if (st.takes.length) {
        const back = st.takes.pop();
        editMems(() => { st.mems = back; });
    } else { toast('ALL CHORDS', 'FIRST TAKE'); return true; }
    toast('ALL CHORDS: TAKE ' + (st.takes.length + 1), order.map(s => st.mems[s].name).join(' '));
    return true;
}

function generate(n) {
    const prog = makeProgression(st.keyRoot, st.scale, n);
    let prev = null;
    const mems = prog.map(c => {
        const m = { pc: c.pc, q: c.q, baseQ: c.q, ext: [], oct: 0, voicing: 0, open: false, bassDeg: 0 };
        m.voicing = smoothVoicing(m, prev);
        const r = renderChord(m);
        prev = r.notes;
        return r;
    });
    editMems(() => { for (let s = 0; s < 8; s++) st.mems[s] = mems[s] || null; });
    st.takes = []; st.stepTakes = [];
    stopHeld();
    st.range = null;
    startPreview();
    toast('NEW: ' + keyLabel(), mems.map(m => m.name).join(' '));
}

function stepOctave(s, dir) {
    const m = st.mems[s];
    setStep(s, renderChord({ ...m, oct: clamp((m.oct || 0) + dir, -2, 2) }));
}

/* Like a held step + -/+ on Move: the chord moves a semitone, keeping its shape. */
function stepSemitone(s, dir) {
    const m = st.mems[s];
    let pc = m.pc + dir, oct = m.oct || 0;
    if (pc > 11) { pc -= 12; oct++; }
    if (pc < 0) { pc += 12; oct--; }
    setStep(s, renderChord({ ...m, pc, oct: clamp(oct, -2, 2) }));
}

/* -/+ on a held step: a tap is a semitone, a long press an octave (fired from tick). */
function plusMinusDown(dir) {
    if (st.heldStep >= 0 && st.mems[st.heldStep]) { st.plusMinus = { dir, at: Date.now(), fired: false, step: st.heldStep }; return; }
    if (st.shift) shiftRows(dir); else octave(dir);
}

function plusMinusUp() {
    const pm = st.plusMinus;
    st.plusMinus = null;
    if (pm && !pm.fired && st.mems[pm.step]) stepSemitone(pm.step, pm.dir);
}

function tickPlusMinus() {
    const pm = st.plusMinus;
    if (!pm || pm.fired || Date.now() - pm.at < LONG_PRESS_MS || !st.mems[pm.step]) return;
    pm.fired = true;
    stepOctave(pm.step, pm.dir);
}

/* Left/Right: the previous or next chord of the progression, like moving between bars on Move. */
function navigate(dir) {
    if (st.heldStep >= 0) { turnStep(st.heldStep, dir); return; }
    const order = playOrder();
    if (!order.length) { toast('PROGRESSION', 'CAPTURE OR SAVE CHORDS'); return; }
    const p = st.player;
    if (p && !p.waiting) { jumpRun(p, dir); return; }
    let i = order.indexOf(st.navStep);
    i = i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length;
    st.navStep = order[i];
    soundChord(32 + st.navStep, st.mems[st.navStep], 100, perfFor(st.mems[st.navStep]));
}

function navigateUp() {
    if (st.navStep >= 0 && !st.player) releaseChord(32 + st.navStep);
}

function octave(dir) {
    st.oct = clamp(st.oct + dir, -2, 2);
    toast('OCTAVE', signed(st.oct));
    replayHeld();
}

function undo() {
    if (!st.undo.length) { toast('UNDO', 'NOTHING TO UNDO'); return; }
    st.mems = st.undo.pop();
    st.memsAt = Date.now();
    toast('UNDO', 'STEPS RESTORED');
}

/* ---------- the player ---------- */

/* Shift+Play: just the progression, without Move's transport. */
/*
 * Move's clock, from Bloom's DSP (dsp/clock.c): beats since Move's transport started, or -1.
 * Reading it costs a round trip to the audio thread, so it is read every few ticks and
 * interpolated in between at the current tempo.
 */
const CLOCK_READ_TICKS = 12;

function readClock() {
    if (typeof host_module_get_param !== 'function') return;
    const raw = host_module_get_param('clock');
    if (!raw) { st.clock = null; return; }
    const [beat, bpm] = String(raw).split(' ').map(Number);
    if (!isFinite(beat)) return;
    st.clock = { beat, at: Date.now() };
    if (bpm > 20 && bpm < 400) st.tempo = bpm;
}

function clockBeat() {
    const c = st.clock;
    if (!c || c.beat < 0) return -1;
    return c.beat + (Date.now() - c.at) / beatMs();
}

/* Count-in is a Move setting; Bloom only needs to know whether it is on. */
function countInOn() {
    const s = readJson('/data/UserData/settings/Settings.json');
    return !!(s && s.isUsingCountIn);
}

/*
 * A run plays steps by position, not by timers: where it is comes from Move's clock when Move
 * plays (so it can't drift from Move), otherwise from the time it started. Each tick works out
 * which step that position falls in and sounds it when it changes.
 *   origin   beat (clock) or Date.now() ms (free) where the run's first step starts
 *   whole    play every saved step, ignoring the Loop range
 *   once     stop after one pass (recording)
 */
function newRun(opts) { return { origin: 0, clock: false, cur: null, offBeat: -1, step: undefined, ...opts }; }

function runOrder(r) { return r.whole ? memOrder() : playOrder(); }

function runPos(r) {
    if (r.clock) { const b = clockBeat(); return b < 0 ? -1 : b - r.origin; }
    return (Date.now() - r.origin) / beatMs();
}

/* Re-anchor a run so it carries on from the same position on a different time base. */
function rebase(r, useClock) {
    const pos = Math.max(0, runPos(r));
    r.clock = useClock;
    r.origin = useClock ? clockBeat() - pos : Date.now() - pos * beatMs();
}

/* Sound whatever the run should be playing now; returns false once a single pass has ended. */
function stepRun(r) {
    const order = runOrder(r);
    if (!order.length) return false;
    const pos = runPos(r);
    if (pos < 0) return true;
    const lens = order.map(s => memBeats(st.mems[s]));
    const total = lens.reduce((x, y) => x + y, 0);
    if (r.once && pos >= total) return false;
    const lap = Math.floor(pos / total);
    let at = pos - lap * total, k = 0;
    while (k < order.length - 1 && at >= lens[k]) at -= lens[k++];
    if (r.offBeat >= 0 && pos >= r.offBeat) { r.offBeat = -1; if (st.rootPad === PLAYER_PAD) stopHeld(); }
    const id = lap * 64 + k;
    if (id === r.cur || st.heldStep >= 0) return true;
    r.cur = id;
    const s = order[k], m = st.mems[s], perf = perfFor(m);
    r.step = s;
    soundChord(PLAYER_PAD, m, 100, perf);
    r.offBeat = perf.gate < 1 ? pos - at + lens[k] * perf.gate : -1;
    return true;
}

/* Jump the run to the previous or next step, keeping time. */
function jumpRun(r, dir) {
    const order = runOrder(r);
    if (!order.length) return;
    const lens = order.map(s => memBeats(st.mems[s]));
    const total = lens.reduce((x, y) => x + y, 0);
    const pos = Math.max(0, runPos(r));
    let at = pos % total, k = 0;
    while (k < order.length - 1 && at >= lens[k]) at -= lens[k++];
    const target = (k + dir + order.length) % order.length;
    const startOf = i => lens.slice(0, i).reduce((x, y) => x + y, 0);
    const shift = startOf(target) - (startOf(k) + at);
    r.origin -= r.clock ? shift : shift * beatMs();
    r.cur = null;
}

function startPlayer(opts) {
    if (!memOrder().length) { toast('PROGRESSION', 'CAPTURE OR SAVE CHORDS'); return false; }
    if (st.rootPad === PLAYER_PAD) stopHeld();
    st.player = newRun(opts);
    return true;
}

function stopPlayer(why) {
    st.player = null;
    if (st.rootPad === PLAYER_PAD) stopHeld();
    if (why) toast('PROGRESSION', why);
}

/* Bloom alone, with Move stopped: from now. With Move playing: from its next bar. */
function startPreview() {
    const b = clockBeat();
    if (st.movePlaying && b >= 0) return startPlayer({ clock: true, origin: Math.ceil(b / st.beatsPerBar) * st.beatsPerBar });
    return startPlayer({ origin: Date.now() });
}

/*
 * Play: start Move and the progression together from the Loop range's first step, or stop
 * everything, including Capture's preview. Shift+Play: the same with every step, ignoring the Loop range.
 */
function playButton(whole) {
    if (st.movePlaying || st.player) {
        if (st.movePlaying) pressButton(CC_PLAY);
        stopPlayer();
        return;
    }
    if (!startPlayer({ linked: true, whole, waiting: true, startBy: Date.now() + 1500 })) return;
    pressButton(CC_PLAY);
    toast(whole ? 'WHOLE PROGRESSION' : 'PLAY', st.range && !whole ? 'STEPS ' + (st.range.a + 1) + ' TO ' + (st.range.b + 1) : memOrder().length + ' CHORDS');
}

/* Loop released: the steps tapped while it was held become the range; none means all steps. */
function loopReleased() {
    const picks = st.loopPicks;
    st.loopHeld = false; st.loopPicks = [];
    if (picks.length) {
        st.range = { a: Math.min(...picks), b: Math.max(...picks) };
        toast('LOOP', st.range.a === st.range.b ? 'STEP ' + (st.range.a + 1) : 'STEPS ' + (st.range.a + 1) + ' TO ' + (st.range.b + 1));
    } else {
        st.range = null;
        toast('LOOP', 'ALL STEPS');
    }
    st.memsAt = Date.now();
    const p = st.player;
    if (p) startRangeOnBar(p);
}

/* The new Loop range starts on the next bar, like a clip launch; a press just after a bar line counts as on it. */
function startRangeOnBar(p) {
    const pos = runPos(p);
    if (pos < 0) return;
    const bar = st.beatsPerBar;
    const next = Math.max(0, Math.ceil((pos - 0.25) / bar) * bar);
    p.origin += p.clock ? next : next * beatMs();
    p.cur = null;
    p.offBeat = -1;
}

/*
 * Move's transport, every tick. A run waiting for Move locks to its clock when it starts
 * (beat 0 is bar 1); a Play-started run stops with Move; a preview carries on by itself.
 */
/*
 * Schwung's copy of Move's state can get stuck: seen reading "playing" for minutes with Move
 * stopped. Bloom's clock reads -1 whenever Move is stopped, so once the two disagree for longer
 * than a count-in, the clock decides until Schwung reads "stopped" again.
 */
function transportPlaying(mi) {
    if (!mi.playing) { st.infoStuck = false; st.clockOffSince = 0; return false; }
    if (!st.clock) return true;
    if (clockBeat() >= 0) { st.clockOffSince = 0; return true; }
    if (st.infoStuck) return false;
    if (!st.clockOffSince) st.clockOffSince = Date.now();
    if (Date.now() - st.clockOffSince < 2 * st.beatsPerBar * beatMs() + 500) return true;
    st.infoStuck = true;
    console.log('bloom: Schwung says Move is playing but the clock is stopped; following the clock');
    return false;
}

function followTransport() {
    if (typeof host_get_move_info !== 'function') return;
    const mi = host_get_move_info();
    if (!mi || !mi.valid) return;
    const playing = transportPlaying(mi);
    if (playing && !st.movePlaying) st.playingSince = Date.now();
    const p = st.player;
    if (p && !st.bounce) {
        if (p.waiting && playing && clockBeat() >= 0) { p.waiting = false; p.clock = true; p.origin = 0; p.cur = null; }
        else if (p.waiting && p.startBy && Date.now() > p.startBy) { p.waiting = false; p.origin = Date.now(); }
        else if (!p.waiting && !p.clock && playing && clockBeat() >= 0) rebase(p, true);
        else if (p.clock && clockBeat() < 0) { if (p.linked) stopPlayer(); else rebase(p, false); }
    }
    if (playing === st.movePlaying) return;
    st.movePlaying = playing;
    if (!playing && p && p.linked && !st.bounce) stopPlayer();
    st.dirty = true;
}

function tickPlayer() {
    const p = st.player;
    if (!p || p.waiting) return;
    if (!stepRun(p)) stopPlayer();
}

/* ---------- recording onto Move ---------- */

/*
 * One pass per track: stop Move, select the track, press Record, and play the steps once
 * against Move's clock, then press Play to stop. Chords first, then the bass on its own track.
 *
 * With count-in on, Move reports playing a bar before it records. Whether its clock counts
 * that bar isn't documented, so the first pass measures it: a clock that starts with "playing"
 * includes the count-in (start the chords a bar in), one that starts a bar later doesn't.
 */
function startBounce() {
    const order = playOrder();
    if (!order.length) { toast('RECORD', 'CAPTURE OR SAVE CHORDS'); return; }
    st.player = null;
    stopHeld();
    allNotesOff();
    const anyBass = order.some(s => perfFor(st.mems[s]).bass);
    const passes = [{ track: cfg.chordCh, parts: { chords: true, bass: bassOnChords() }, label: 'CHORDS' }];
    if (anyBass && !bassOnChords()) passes.push({ track: cfg.bassCh, parts: { chords: false, bass: true }, label: 'BASS' });
    const now = Date.now();
    st.bounce = { passes, pass: 0, stage: 'stop', pressed: false, at: now, deadline: now + 2500, parts: passes[0].parts, countIn: countInOn() };
    st.dirty = true;
}

function endBounce(title, value) {
    if (st.rootPad === PLAYER_PAD) stopHeld();
    allNotesOff();
    st.bounce = null;
    requestSelect();
    toast(title, value);
}

function cancelBounce() {
    if (st.movePlaying) pressButton(CC_PLAY);
    endBounce('RECORDING', 'CANCELLED');
}

/* Where a recording pass's first chord goes, once Move's clock has started. */
/*
 * With count-in on, Move's clock either runs through the count-in or starts when recording does.
 * Which one shows in how long the clock took to start after Record was pressed.
 */
function bounceOrigin(b) {
    if (!b.countIn) return 0;
    const gap = (b.clockAt - b.recAt) / beatMs();
    const inClock = gap < st.beatsPerBar / 2;
    console.log('bloom: count-in ' + (inClock ? 'is' : 'is not') + ' in Move\'s clock (' + gap.toFixed(2) + ' beats after Record)');
    return inClock ? st.beatsPerBar : 0;
}

function tickBounce() {
    const b = st.bounce;
    if (!b) return;
    const now = Date.now(), pass = b.passes[b.pass];
    if (b.stage === 'stop') {
        if (st.movePlaying && now < b.deadline) { if (!b.pressed) { pressButton(CC_PLAY); b.pressed = true; } return; }
        b.stage = 'select'; b.at = now; b.deadline = now + 3000;
    } else if (b.stage === 'select') {
        if (selectedTrack() === pass.track || now > b.deadline) { b.stage = 'arm'; b.at = now + 300; }
        else if (now >= b.at && !st.controlQueue.length) { pressButton(CC_TRACK1 - pass.track); b.at = now + 1000; }
    } else if (b.stage === 'arm') {
        if (now < b.at) return;
        pressButton(CC_REC);
        b.recAt = now;
        b.stage = 'wait'; b.deadline = now + 8000;
    } else if (b.stage === 'wait') {
        b.parts = pass.parts;
        const bar = st.beatsPerBar * beatMs();
        if (st.movePlaying && clockBeat() >= 0) {
            b.clockAt = now;
            b.run = newRun({ clock: true, origin: bounceOrigin(b), once: true });
            b.stage = 'play';
        } else if (st.movePlaying && now - (st.playingSince || now) > (b.countIn ? bar : 0) + 600) {
            console.log('bloom: no clock from Move, recording on Bloom\'s own timing');
            b.run = newRun({ origin: (st.playingSince || now) + (b.countIn ? st.beatsPerBar * beatMs() : 0), once: true });
            b.stage = 'play';
        } else if (now > b.deadline) endBounce('RECORD', 'MOVE DID NOT START');
    } else if (b.stage === 'play') {
        if (stepRun(b.run)) { b.step = b.run.step; return; }
        stopHeld(); allNotesOff();
        pressButton(CC_PLAY);
        b.stage = 'after'; b.deadline = now + 3000;
    } else if (b.stage === 'after') {
        if (st.movePlaying && now < b.deadline) return;
        if (b.pass + 1 < b.passes.length) {
            b.pass++; b.stage = 'select'; b.at = now + 400; b.deadline = now + 3000; b.step = undefined; b.run = null;
        } else endBounce('RECORDED', b.passes.map(p => p.label + ' T' + (p.track + 1)).join(' + '));
    }
    st.dirty = true;
}

/* ---------- pads ---------- */

function padDown(i, vel) {
    const row = i >> 3, col = i & 7;
    if (row === 3 && cfg.strike) { strike(i, vel); return; }
    if (row === 3) {
        st.heldTypes = st.heldTypes.filter(c => c !== col).concat(col);
        replayHeld();
        return;
    }
    if (row === 2) {
        const tones = strumTones();
        if (!tones.length) return;
        const n = tones.length;
        const note = tones[col % n] + 12 * Math.floor(col / n);
        if (note <= 127) {
            releasePad(i);
            const ch = chordRoute().ch;
            const entry = { ch, note, on: false };
            st.queue.push({ at: 0, pad: i, ch, note, vel: feelVel(vel, perfFor(null)), entry });
            st.sounding.set(i, [entry]);
        }
        st.dirty = true;
        return;
    }
    if (st.del) { stopHeld(); return; }
    if (cfg.strike) pick(i); else playChordPad(i, vel);
}

function padUp(i) {
    const row = i >> 3, col = i & 7;
    if (row === 3 && cfg.strike) { releaseChord(i); return; }
    if (row === 3) {
        st.heldTypes = st.heldTypes.filter(c => c !== col);
        if (st.rootDown && !st.latched) replayHeld();
        st.dirty = true;
        return;
    }
    releaseChord(i);
}

/* ---------- Move's track buttons ---------- */

/*
 * Track buttons work as on Move, which Bloom does for you by pressing Move's own buttons:
 * hold one and turn Volume for that track's volume, Mute + track to mute it, and Delete +
 * track to delete its playing clip (Shift+Undo is Move's Undo). Schwung always hands the
 * Volume knob to Move, so for track volume Bloom only holds Move's track button down and
 * Move does the rest. Move selects a track while its button is down, so Bloom selects the
 * chord track again afterwards.
 */
function trackDb(t) {
    const v = st.tracks[t] && st.tracks[t].volumeDb;
    return typeof v === 'number' && v > -100 ? v.toFixed(1) + ' DB' : '';
}

function trackDown(t) {
    if (st.del) {
        pressButton(CC_TRACK1 - t);
        pressButton(CC_DELETE);
        requestSelect();
        toast('DELETED T' + (t + 1) + ' CLIP', 'SHIFT+UNDO: BRING BACK');
        return;
    }
    if (st.mute) {
        st.controlQueue.push([0x0b, 0xb0, CC_MUTE, 127], [0x0b, 0xb0, CC_TRACK1 - t, 127], [0x0b, 0xb0, CC_TRACK1 - t, 0], [0x0b, 0xb0, CC_MUTE, 0]);
        toast('MUTE', 'TRACK ' + (t + 1));
        return;
    }
    st.trackHeld = t;
    move_midi_inject_to_move([0x0b, 0xb0, CC_TRACK1 - t, 127]);
    st.trackPressed = true;
    toast('TRACK ' + (t + 1) + ' VOLUME', trackDb(t) || 'TURN VOLUME KNOB');
}

function trackVolume() {
    const t = st.trackHeld;
    toast('TRACK ' + (t + 1) + ' VOLUME', trackDb(t) || 'CHANGING');
}

/*
 * While a step is held the Volume knob sets that step's volume, so Schwung is asked to keep
 * it from Move (which would change the master volume too). Raised on the step press, before
 * any volume touch, as Schwung requires.
 */
function ownVolumeKnob(on) {
    if (typeof shadow_set_overtake_suppress_master_volume === 'function') shadow_set_overtake_suppress_master_volume(on ? 1 : 0);
}

function trackUp(t) {
    if (st.trackHeld !== t) return;
    if (st.trackPressed) { move_midi_inject_to_move([0x0b, 0xb0, CC_TRACK1 - t, 0]); requestSelect(); }
    st.trackHeld = -1;
    st.trackPressed = false;
}

/* ---------- knobs and jog ---------- */

const signed = n => (n > 0 ? '+' : '') + n;

function keyLabel() { return NAMES[st.keyRoot] + ' ' + st.scaleName; }

function trackLabel(ch) {
    const t = st.tracks[ch];
    const name = t && t.name ? ' ' + String(t.name).toUpperCase().slice(0, 9) : '';
    return 'TRACK ' + (ch + 1) + name;
}

/* Where the bass is heard live: its own track, or the chord track (by choice, or until its track gets a channel). */
function bassTrackLabel() {
    if (bassOnChords()) return 'CHORD TRACK';
    return 'TRACK ' + (cfg.bassCh + 1) + (bassRoute().needsSetup ? ' (SETUP)' : '');
}

/* Shown when the bass track is on MIDI In Auto: how to give it a channel, on Move's own screen. */
function showBassSetup() {
    const t = cfg.bassCh + 1, c = cfg.chordCh + 1;
    showCard('T' + t + ' NEEDS A CHANNEL', [
        'Live bass: T' + c + ' for now.',
        'Leave Bloom, hold',
        'Shift + Track ' + t + ',',
        'set MIDI In to ' + t + '.',
        'Record works anyway.'
    ]);
}

function speedLabel(perf) {
    if (isArpMode(perf)) return RATES[perf.rate][0];
    return perf.mode === M_STRUM || perf.mode === M_STRUM2 ? perf.strumMs + ' MS' : '-';
}

function spreadLabel(perf) { return isArpMode(perf) ? (perf.spread + 1) + ' OCT' : SPREADS[perf.spread]; }

function knobValue(k) {
    if (st.shift && k === 7) return THEMES[cfg.theme].name;
    if (st.shift && k === 6) return OUTS[cfg.out];
    if (st.shift && k === 4) return trackLabel(cfg.chordCh);
    if (st.shift && k === 5) return bassTrackLabel();
    const g = perfFor(null);
    switch (k) {
        case 0: return MODES[cfg.mode];
        case 1: return beatsLabel(memBeats(null));
        case 2: return isArpMode() ? RATES[cfg.rate][0] + ' @ ' + Math.round(st.tempo) : cfg.strumMs + ' MS';
        case 3: return SOUNDS[cfg.sound];
        case 4: return cfg.vol + '%';
        case 5: return !cfg.bass ? 'OFF' : 'ON: ' + bassTrackLabel();
        case 6: return spreadLabel(g);
        case 7: return cfg.feel ? 'LOOSE ' + cfg.feel : 'STEADY';
    }
    return '';
}

function routeNote(track) {
    const r = route(track);
    return r.off ? 'MIDI IN OFF' : r.auto ? 'AUTO' : 'CH ' + (r.ch + 1);
}

function knobTitle(k) {
    if (st.shift && k === 7) return 'PAD COLOURS';
    if (st.shift && k === 6) return 'MIDI OUT';
    if (st.shift && k === 4) return 'CHORD TRACK: ' + routeNote(cfg.chordCh);
    if (st.shift && k === 5) return bassOnChords() ? 'BASS TRACK' : 'BASS TRACK: ' + routeNote(cfg.bassCh);
    return KNOB_NAMES[k];
}

/* A longer message than a toast: a title and up to five lines, for a few seconds. */
function showCard(title, lines) {
    st.toast = { title, lines, until: Date.now() + 4500 };
    st.dirty = true;
    announce(title + '. ' + lines.join(' '));
}

function toast(title, value) {
    st.toast = { title, value, until: Date.now() + TOAST_MS };
    st.dirty = true;
    announce(title + ', ' + value);
}

/* Step through a list of values; the knob needs `need` detents per step so values don't fly past. */
function knobSteps(k, delta, need) {
    st.knobAcc[k] += delta;
    if (Math.abs(st.knobAcc[k]) < need) return 0;
    const dir = Math.sign(st.knobAcc[k]);
    st.knobAcc[k] = 0;
    return dir;
}

function cycle(options, cur, dir) {
    let i = options.indexOf(cur);
    if (i < 0) i = 0;
    return options[clamp(i + dir, 0, options.length - 1)];
}

function knob(k, delta) {
    if (st.heldStep >= 0 && st.mems[st.heldStep]) { stepKnob(st.heldStep, k, delta); return; }
    if (st.shift && k === 7) {
        const dir = knobSteps(k, delta, 4);
        if (dir) { cfg.theme = clamp(cfg.theme + dir, 0, THEMES.length - 1); applyTheme(); cfg.dirtyAt = Date.now(); }
        toast('PAD COLOURS', THEMES[cfg.theme].name);
        return;
    }
    if (st.shift && k === 6) {
        const dir = knobSteps(k, delta, 4);
        if (dir) { allNotesOff(); cfg.out = clamp(cfg.out + dir, 0, OUTS.length - 1); cfg.dirtyAt = Date.now(); }
        if (cfg.out === OUT_MOVE) toast('MIDI OUT', 'MOVE');
        else showCard('MIDI OUT: ' + OUTS[cfg.out], ['Gear on the USB-A port:', 'chords on channel 1,', 'bass on channel 2.', 'Record still goes', 'to Move tracks.']);
        return;
    }
    if (st.shift && (k === 4 || k === 5)) {
        const dir = knobSteps(k, delta, 4);
        if (dir && k === 4) { allNotesOff(); cfg.chordCh = (cfg.chordCh + dir + 4) % 4; requestSelect(); }
        if (dir && k === 5) {
            allNotesOff();
            cfg.bassCh = cycle([-1, 0, 1, 2, 3].filter(t => t !== cfg.chordCh), bassOnChords() ? -1 : cfg.bassCh, dir);
            if (cfg.bass && bassRoute().needsSetup) { cfg.dirtyAt = Date.now(); showBassSetup(); return; }
        }
    } else if (k === 2 && !isArpMode()) {
        cfg.strumMs = clamp(cfg.strumMs + delta * 2, 5, 150);
    } else if (k === 4) {
        cfg.vol = clamp(cfg.vol + delta * 2, 0, 100);
    } else {
        const dir = knobSteps(k, delta, 4);
        if (!dir) { toast(knobTitle(k), knobValue(k)); return; }
        if (k === 0) {
            const was = cfg.mode;
            cfg.mode = clamp(cfg.mode + dir, 0, MODES.length - 1);
            if (was !== cfg.mode && (st.rootDown || st.latched)) { const l = st.latched; allNotesOff(); replayHeld(); st.latched = l; }
        }
        else if (k === 1) cfg.beats = cycle(STEP_BEATS, memBeats(null), dir);
        else if (k === 2) cfg.rate = clamp(cfg.rate + dir, 0, RATES.length - 1);
        else if (k === 3) {
            cfg.sound = clamp(cfg.sound + dir, 0, SOUNDS.length - 1);
            if (cfg.sound !== S_HOLD && st.latched) stopHeld();
            else if (st.rootDown) replayHeld();
        }
        else if (k === 5) {
            cfg.bass = !cfg.bass;
            if (!cfg.bass) allNotesOff();
            else if (bassRoute().needsSetup) { cfg.dirtyAt = Date.now(); showBassSetup(); return; }
        }
        else if (k === 6) {
            cfg.spread = clamp(cfg.spread + dir, 0, SPREADS.length - 1);
            if (st.arp) st.arp.notes = arpNotes(st.arp.base, st.arp.perf);
            else replayHeld();
        }
        else if (k === 7) cfg.feel = clamp(cfg.feel + dir, 0, 10);
    }
    cfg.dirtyAt = Date.now();
    toast(knobTitle(k), knobValue(k));
}

/*
 * Knobs while holding a step set how that step plays. The first value of each is DEFAULT
 * (null), which follows the global knob.
 */
const STRUM_MS = [null]; for (let ms = 5; ms <= 150; ms += 5) STRUM_MS.push(ms);
const STEP_VOLS = []; for (let v = 5; v <= 100; v += 5) STEP_VOLS.push(v);

function stepKnob(s, k, delta) {
    const m = st.mems[s], perf = perfFor(m);
    const fine = k === 2 && !isArpMode(perf) || k === 4;
    const dir = knobSteps(k, delta, fine ? 1 : 3);
    if (!dir) return;
    const own = key => (m[key] != null ? m[key] : null);
    const next = { ...m };
    if (k === 0) next.mode = cycle([null, 0, 1, 2, 3, 4, 5, 6], own('mode'), dir);
    else if (k === 1) next.beats = cycle([null, ...STEP_BEATS], own('beats'), dir);
    else if (k === 2 && isArpMode(perf)) next.rate = cycle([null, 0, 1, 2, 3], own('rate'), dir);
    else if (k === 2) next.strumMs = cycle(STRUM_MS, own('strumMs'), dir);
    else if (k === 3) next.gate = cycle(GATES, perf.gate, dir);
    else if (k === 4) next.vol = cycle(STEP_VOLS, own('vol') ?? 100, dir);
    else if (k === 5) next.bassOn = cycle([null, true, false], own('bassOn'), dir);
    else if (k === 6) next.spread = cycle([null, 0, 1, 2], own('spread'), dir);
    else if (k === 7) next.feel = cycle([null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], own('feel'), dir);
    for (const key of ['mode', 'beats', 'rate', 'strumMs', 'bassOn', 'spread', 'feel']) if (next[key] === null) delete next[key];
    if (next.gate === 1) delete next.gate;
    if (next.vol === 100) delete next.vol;
    editMems(() => { st.mems[s] = next; });
    soundChord(32 + s, next, 100, perfFor(next));
}

/* Each knob's setting for a step; own is true when the step sets it rather than following the global knob. */
function stepParams(m) {
    const p = perfFor(m), has = key => m[key] != null;
    return [
        [SHORT_MODES[p.mode], has('mode')],
        [beatsLabel(memBeats(m)), has('beats')],
        ['SPD ' + speedLabel(p), isArpMode(p) ? has('rate') : has('strumMs')],
        ['GATE ' + Math.round(p.gate * 100) + '%', has('gate')],
        ['VOL ' + (m.vol ?? 100) + '%', has('vol')],
        ['BASS ' + (p.bass ? 'ON' : 'OFF'), has('bassOn')],
        [spreadLabel(p), has('spread')],
        ['FEEL ' + p.feel, has('feel')]
    ];
}

function wheel(dir) {
    if (st.heldStep >= 0) { turnStep(st.heldStep, dir); return; }
    if (st.rootDown && st.rootPad < 16) {
        st.voicing = clamp(st.voicing + dir, -4, 6);
        replayHeld();
        return;
    }
    if (turnAll(dir)) return;
    st.voicing = clamp(st.voicing + dir, -4, 6);
    toast('INVERSION', signed(st.voicing));
}

function shiftRows(dir) {
    st.turn = clamp(st.turn + dir, -6, 6);
    toast('CHORD ROWS START ON', NAMES[pcOf(padInfo(0, 0).pc)] + (st.turn ? '' : ' (KEY)'));
    st.dirty = true;
}

/* ---------- Move's set ---------- */

function readMoveInfo() {
    if (typeof host_get_move_info !== 'function') return;
    const mi = host_get_move_info();
    if (!mi || !mi.valid) return;
    const root = mi.rootNote >= 0 && mi.rootNote < 12 ? mi.rootNote : 0;
    const scale = scaleFor(mi.scale) || MAJOR;
    const scaleName = scaleFor(mi.scale) ? String(mi.scale).toUpperCase() : 'MAJOR';
    if (root !== st.keyRoot || scaleName !== st.scaleName) {
        st.keyRoot = root; st.scale = scale; st.scaleName = scaleName; st.turn = 0;
        st.dirty = true;
    }
    if (mi.tempo > 0) st.tempo = mi.tempo;
    if (mi.tsUpper > 0 && mi.tsUpper < 32) st.beatsPerBar = mi.tsUpper;
    if (Array.isArray(mi.tracks)) st.tracks = mi.tracks;
    st.selTrack = mi.selectedTrack >= 0 && mi.selectedTrack < 4 ? mi.selectedTrack : -1;
}

/* ---------- LEDs ---------- */

function playingStep() {
    if (st.bounce) return st.bounce.step;
    if (st.player && st.rootPad === PLAYER_PAD && st.rootDown) return st.player.step;
    if (st.rootDown && st.rootPad >= 32 && st.rootPad < 48) return st.rootPad - 32;
    return -1;
}

function padColor(i) {
    const row = i >> 3, col = i & 7;
    if (row === 3) return cfg.strike ? strikeColor(i) : typeColor(col);
    if (row === 2) return st.sounding.has(i) ? COL.white : (strumTones().length ? COL.grey : COL.off);
    if (st.rootDown && i === st.rootPad) return COL.held;
    if (cfg.strike && st.sel && i === st.sel.pad) return COL.held;
    const p = padInfo(row, col);
    if (st.rootDown && st.rootPad >= 32 && st.cur && pcOf(st.cur.pc) === pcOf(p.pc) && (st.cur.q === 'maj') === (row === 0)) return COL.held;
    if (!p.inKey) return cfg.keyLock ? COL.off : (row ? COL.minOut : COL.majOut);
    return row ? COL.min : COL.maj;
}

/* Top row, pick-then-strike: plain is white, voicings that stay in key violet, ones that leave it red. */
function strikeColor(i) {
    if (st.rootDown && i === st.rootPad) return COL.held;
    if (!st.sel) return COL.vdviolet;
    const col = i & 7, shape = strikeShape(col);
    if (!chordInKey(st.sel.pc, shape.q, shape.ext)) return COL.clash;
    return col === 0 ? COL.white : COL.violet;
}

/* Top row, touch and play: brighter while held; red when it would take the sounding chord out of key. */
function typeColor(col) {
    const [kind, val] = TYPES[col];
    const held = st.heldTypes.includes(col);
    if (!st.rootDown || !st.cur || !st.cur.q || !QUAL[st.cur.q]) return held ? COL.violet : COL.vdviolet;
    const clash = !chordInKey(st.cur.pc, kind === 'q' ? val : st.cur.q, kind === 'e' ? [val] : []);
    if (held) return clash ? COL.clash : COL.violet;
    return clash ? COL.dclash : COL.dviolet;
}

function stepColor(s) {
    if (st.loopHeld) {
        if (st.loopPicks.includes(s)) return COL.white;
        return st.mems[s] ? (inRange(s) ? COL.mem : COL.memSlot) : COL.off;
    }
    if (playingStep() === s) return COL.memOn;
    if (st.mems[s]) return inRange(s) ? COL.mem : COL.memSlot;
    return st.shift ? COL.memSlot : COL.off;
}

function buttonLed(cc, color) {
    if (st.btnLeds[cc] === color) return false;
    setButtonLED(cc, color);
    st.btnLeds[cc] = color;
    return true;
}

/* The MIDI buffer holds ~64 packets, so send a few LED changes per tick. */
function updateLeds() {
    let sent = 0;
    for (let i = 0; i < 48 && sent < LEDS_PER_TICK; i++) {
        const c = i < 32 ? padColor(i) : stepColor(i - 32);
        if (ledShown[i] === c) continue;
        setLED(i < 32 ? PAD0 + i : STEP0 + i - 32, c);
        ledShown[i] = c;
        sent++;
    }
    if (sent < LEDS_PER_TICK) buttonLed(CC_LOOP, st.range || st.loopHeld ? COL.loop : COL.off);
    if (sent < LEDS_PER_TICK) buttonLed(CC_PLAY, st.player && !st.player.waiting ? COL.held : COL.off);
    for (let t = 0; t < 4 && sent < LEDS_PER_TICK; t++)
        buttonLed(CC_TRACK1 - t, t === st.trackHeld ? COL.white : t === cfg.chordCh ? COL.maj : cfg.bass && !bassOnChords() && t === cfg.bassCh ? COL.min : COL.off);
    if (sent < LEDS_PER_TICK) buttonLed(CC_REC, st.bounce ? COL.rec : COL.off);
}

/* ---------- display ---------- */

function drawBig(text, y) {
    if (bigFont) set_font(BIG_FONT);
    if (bigFont && text_width(text) > 128) set_font(DEFAULT_FONT);
    print(0, y, text, 1);
    if (bigFont) set_font(DEFAULT_FONT);
}

/* The progression along the bottom, starting near the playing chord, which is shown inverted. */
function drawSequence(y) {
    const order = playOrder(), cur = playingStep();
    let start = Math.max(0, order.indexOf(cur) - 1);
    let x = 0;
    for (let k = start; k < order.length; k++) {
        const name = st.mems[order[k]].name, w = text_width(name);
        if (x + w > 128) break;
        if (order[k] === cur) { fill_rect(x, y - 1, w + 2, 10, 1); print(x + 1, y, name, 0); }
        else print(x + 1, y, name, 1);
        x += w + 6;
    }
}

/*
 * Holding a step: its chord on top, then the eight knobs in two columns (knob 1 and 2 on the
 * first line, 3 and 4 on the next...). Settings the step sets itself are shown inverted.
 */
function drawStep(s) {
    const m = st.mems[s];
    fill_rect(0, 0, 128, 11, 1);
    print(2, 2, 'STEP ' + (s + 1) + '  ' + m.name, 0);
    stepParams(m).forEach(([text, own], k) => {
        const x = k % 2 ? 66 : 0, y = 13 + Math.floor(k / 2) * 10;
        if (own) { fill_rect(x, y - 1, text_width(text) + 3, 10, 1); print(x + 1, y, text, 0); }
        else print(x + 1, y, text, 1);
    });
    print(0, 55, voicingLabel(m), 1);
}

function headline() {
    const b = st.bounce;
    if (b) {
        const pass = b.passes[b.pass];
        const what = { stop: 'STOPPING', select: 'SELECTING', arm: 'ARMING', wait: 'WAITING', play: 'REC', after: 'SAVING' }[b.stage];
        return what + ' ' + pass.label + ' T' + (pass.track + 1);
    }
    if (st.player) return st.player.waiting ? 'WAITING' : 'PLAYING';
    return keyLabel() + (cfg.keyLock ? '' : ' FREE') + (cfg.strike ? ' PICK' : '');
}

function draw() {
    clear_screen();
    if (bigFont) set_font(DEFAULT_FONT);

    if (st.heldStep >= 0 && st.mems[st.heldStep]) { drawStep(st.heldStep); return; }
    if (st.toast && Date.now() < st.toast.until) {
        fill_rect(0, 0, 128, 11, 1);
        print(2, 2, st.toast.title, 0);
        if (st.toast.lines) st.toast.lines.forEach((line, i) => print(0, 14 + i * 10, line, 1));
        else drawBig(st.toast.value, 22);
        return;
    }
    st.toast = null;

    const head = headline();
    const mode = cfg.sound === S_MUTED ? 'MUTED'
        : (isArpMode() ? MODES[cfg.mode] + ' ' + RATES[cfg.rate][0] : MODES[cfg.mode] + (cfg.mode === M_STRUM ? ' ' + cfg.strumMs : ''))
          + (cfg.sound === S_HOLD ? ' H' : '');
    print(128 - text_width(mode), 0, mode, 1);
    const room = 124 - text_width(mode);
    print(0, 0, text_width(head) > room ? head.slice(0, Math.max(3, Math.floor(room / 6))) : head, 1);

    drawBig(st.name, 13);

    const y = 40;
    for (let m = 36; m < 96; m++) {
        const x = (4 + (m - 36) * 2) | 0;
        const black = [1, 3, 6, 8, 10].includes(m % 12);
        if (m % 12 === 0) fill_rect(x, y - 3, 1, 2, 1);
        if (st.notes.includes(m)) fill_rect(x, y, 2, 7, 1);
        else if (st.bassOn && m === st.bassNote) fill_rect(x, y + 4, 2, 3, 1);
        else set_pixel(x, black ? y + 2 : y + 6, 1);
    }

    const held = st.heldStep >= 0 && st.mems[st.heldStep];
    if (held) { print(0, 54, voicingLabel(held), 1); return; }
    if (st.shift) { print(0, 54, 'SAVE TO STEP', 1); return; }
    if (st.del) { print(0, 54, 'CLEAR STEP', 1); return; }
    if (st.loopHeld) { print(0, 54, 'TAP FIRST + LAST STEP', 1); return; }
    if (memOrder().length) { drawSequence(55); return; }
    const b = !cfg.bass ? 'BASS OFF' : bassOnChords() ? 'BASS ON CHORDS' : bassRoute().needsSetup ? 'BASS: SETUP T' + (cfg.bassCh + 1) : 'BASS T' + (cfg.bassCh + 1);
    print(0, 54, 'T' + (cfg.chordCh + 1) + ' CAPTURE = IDEAS', 1);
    print(128 - text_width(b), 54, b, 1);
}

/* ---------- lifecycle ---------- */

globalThis.init = function () {
    invalidateLedCache();
    ledShown.fill(-1);
    st.btnLeds = {};
    bigFont = typeof set_font === 'function' && !!set_font(BIG_FONT);
    if (bigFont) set_font(DEFAULT_FONT);
    loadState();
    applyTheme();
    readMoveInfo();
    st.homeTrack = selectedTrack();
    readInputModes();
    requestSelect();
    st.dirty = true;
    console.log('bloom: init, set ' + st.setId + ', ' + st.mems.filter(Boolean).length + ' memories');
};

globalThis.tick = function () {
    flushQueue();
    flushOut();
    flushControls();
    tickPlusMinus();
    if (st.ticks % CLOCK_READ_TICKS === 0) { readClock(); if (st.trackHeld >= 0) readMoveInfo(); }
    followTransport();
    tickBounce();
    tickPlayer();
    tickArp();
    updateLeds();
    if (++st.ticks % 172 === 0) {
        readMoveInfo();
        tickSelect();
        if (cfg.dirtyAt && Date.now() - cfg.dirtyAt > 1500) { delete cfg.dirtyAt; saveSettings(); }
        if (st.memsAt && Date.now() - st.memsAt > 800) saveMems();
    }
    if (st.ticks % 1720 === 0 && !st.bounce) {
        readInputModes();
        if (currentSetId() !== st.setId) {
            if (st.memsAt) saveMems();
            st.player = null; loadMems(); requestSelect(); st.dirty = true;
        }
    }
    if (st.toast && Date.now() >= st.toast.until) st.dirty = true;
    if (st.dirty) { draw(); st.dirty = false; }
};

globalThis.onMidiMessageInternal = function (data) {
    if (isNoiseMessage(data)) return;
    const type = data[0] & 0xf0, d1 = data[1], d2 = data[2];

    if (st.bounce) {
        if (type === 0xb0 && d1 === CC_REC && d2 > 0) cancelBounce();
        return;
    }
    if (type === 0x90 || type === 0x80) {
        const on = type === 0x90 && d2 > 0;
        if (d1 < 8) {
            if (!on || st.heldStep >= 0) return;
            if (d1 === 5 && cfg.bass && bassRoute().needsSetup) showBassSetup();
            else toast(knobTitle(d1), knobValue(d1));
            return;
        }
        if (d1 < 10) return;
        if (d1 >= STEP0 && d1 < STEP0 + 16) { if (on) stepDown(d1 - STEP0, d2); else stepUp(d1 - STEP0); return; }
        if (d1 < PAD0 || d1 > PAD0 + 31) return;
        if (on) padDown(d1 - PAD0, d2);
        else padUp(d1 - PAD0);
        return;
    }
    if (type !== 0xb0) return;
    const press = d2 > 0;
    if (d1 === CC_SHIFT) { st.shift = press; st.dirty = true; }
    else if (d1 === CC_DELETE && press && st.shift) panic();
    else if (d1 === CC_DELETE) { st.del = press; st.dirty = true; }
    else if (d1 === CC_UNDO && press && st.shift) { pressButton(CC_UNDO); toast('MOVE', 'UNDO'); }
    else if (d1 === CC_UNDO && press) undo();
    else if (d1 === CC_MUTE) st.mute = press;
    else if (d1 >= CC_TRACK1 - 3 && d1 <= CC_TRACK1) { if (press) trackDown(CC_TRACK1 - d1); else trackUp(CC_TRACK1 - d1); }
    else if (d1 === CC_VOLUME && st.trackHeld >= 0) trackVolume();
    else if (d1 === CC_LOOP && press && st.shift) {
        cfg.strike = !cfg.strike;
        cfg.dirtyAt = Date.now();
        st.sel = null;
        st.armNotes = [];
        st.heldTypes = [];
        toast('PLAY STYLE', cfg.strike ? 'PICK, THEN STRIKE' : 'TOUCH AND PLAY');
    }
    else if (d1 === CC_LOOP) { if (press) { st.loopHeld = true; st.loopPicks = []; st.dirty = true; } else if (st.loopHeld) loopReleased(); }
    else if (d1 === CC_PLAY && press) playButton(st.shift);
    else if (d1 === CC_CAPTURE && press) generate(st.shift ? 8 : 4);
    else if (d1 === CC_REC && press) startBounce();
    else if (d1 === CC_LEFT || d1 === CC_RIGHT) { if (press) navigate(d1 === CC_RIGHT ? 1 : -1); else navigateUp(); }
    else if (d1 === CC_UP || d1 === CC_DOWN) { if (press) plusMinusDown(d1 === CC_UP ? 1 : -1); else plusMinusUp(); }
    else if (d1 === CC_VOLUME && st.heldStep >= 0) stepKnob(st.heldStep, 4, decodeDelta(d2));
    else if (d1 === CC_JOG) {
        const d = decodeDelta(d2);
        if (d) wheel(Math.sign(d));
    } else if (d1 === CC_JOG_CLICK && press) {
        if (st.heldStep >= 0) plainStep(st.heldStep);
        else if (st.shift) {
            cfg.keyLock = !cfg.keyLock;
            cfg.dirtyAt = Date.now();
            toast('OUT-OF-KEY CHORDS', cfg.keyLock ? 'HIDDEN' : 'PLAYABLE');
        } else {
            cfg.smooth = !cfg.smooth;
            cfg.dirtyAt = Date.now();
            st.prev = null;
            toast('SMOOTH VOICING', cfg.smooth ? 'ON' : 'OFF');
        }
    } else if (d1 >= CC_KNOB1 && d1 <= CC_KNOB8) {
        knob(d1 - CC_KNOB1, decodeDelta(d2));
    }
};

globalThis.onMidiMessageExternal = function () {};

/*
 * On exit Schwung repaints Move's LEDs from a snapshot taken when Bloom opened, so anything
 * Move changed underneath (above all the selected track, which Bloom switches) would stay
 * stale on the pads. Handing Move back the track it had keeps the snapshot true.
 */
function restoreHomeTrack() {
    const home = st.homeTrack;
    if (home < 0 || home > 3 || selectedTrack() === home) return;
    move_midi_inject_to_move([0x0b, 0xb0, CC_TRACK1 - home, 127]);
    move_midi_inject_to_move([0x0b, 0xb0, CC_TRACK1 - home, 0]);
}

globalThis.onUnload = function () {
    st.player = null;
    st.bounce = null;
    allNotesOff();
    while (st.out.length) move_midi_inject_to_move(st.out.shift());
    for (let n = 0; n < 64 && st.usbOut.length; n++) flushUsb();
    restoreHomeTrack();
    ownVolumeKnob(false);
    delete cfg.dirtyAt;
    saveSettings();
    if (st.memsAt) saveMems();
};
