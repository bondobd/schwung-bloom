/*
 * Runs src/ui.js in node with Schwung's host functions stubbed, so tests can press pads and
 * buttons and read back the MIDI, LEDs and screen. Each test file gets one Bloom (node --test
 * runs files in separate processes).
 */
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SET_ID = '6b99d1a6-371b-420e-9684-ae71874b8697';

export async function loadBloom({ key = 0, scale = 'Major', tempo = 120, settings = {}, inputModes = ['auto', 'auto', 'auto', 'auto'], countIn = false } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'bloom-'));
    const ui = readFileSync(join(here, '../src/ui.js'), 'utf8')
        .replace("'/data/UserData/schwung/shared/input_filter.mjs'", JSON.stringify(pathToFileURL(join(here, 'stubs/input_filter.mjs')).href))
        .replace("'/data/UserData/schwung/shared/screen_reader.mjs'", JSON.stringify(pathToFileURL(join(here, 'stubs/screen_reader.mjs')).href));
    writeFileSync(join(dir, 'ui.mjs'), ui);
    copyFileSync(join(here, '../src/chords.mjs'), join(dir, 'chords.mjs'));

    const move = { playing: false, selected: 0, key, scale, tempo, startedAt: 0, clock: true };
    const b = {
        move, midi: [], controls: [], leds: new Map(), buttons: new Map(), spoken: [], screen: [],
        files: {
            '/data/UserData/schwung/active_set.txt': SET_ID + '\nSet 1\n',
            [`/data/UserData/UserLibrary/Sets/${SET_ID}/Set 1/Song.abl`]:
                inputModes.map(m => `{"midiInputMode": ${m === 'auto' ? '"auto"' : '[' + m + ']'}}`).join(','),
            '/data/UserData/schwung/config/bloom/settings.json': JSON.stringify({ v: 3, ...settings }),
            '/data/UserData/settings/Settings.json': JSON.stringify({ isUsingCountIn: countIn })
        }
    };
    globalThis.__bloom = b;
    globalThis.move_midi_inject_to_move = p => {
        if ((p[0] >> 4) === 2) { b.midi.push({ t: Date.now(), on: (p[1] & 0xf0) === 0x90, ch: p[1] & 15, note: p[2], vel: p[3] }); return; }
        if (p[3] !== 127) return;
        b.controls.push(p[2]);
        if (p[2] >= 40 && p[2] <= 43) move.selected = 43 - p[2];
        const start = () => { move.playing = true; move.startedAt = Date.now(); };
        if (p[2] === 86) setTimeout(start, 20);
        if (p[2] === 85) { const was = move.playing; setTimeout(() => (was ? (move.playing = false) : start()), 20); }
    };
    globalThis.host_get_move_info = () => ({
        valid: 1, playing: move.playing, rootNote: move.key, scale: move.scale, tempo: move.tempo, tsUpper: 4,
        selectedTrack: move.selected, tracks: [0, 1, 2, 3].map(i => ({ selected: i === move.selected }))
    });
    /* Bloom's DSP: Move's beat position while playing, -1 when stopped. */
    globalThis.host_module_get_param = key => {
        if (key !== 'clock' || !move.clock) return null;
        const beat = move.playing ? (Date.now() - move.startedAt) / (60000 / move.tempo) : -1;
        return beat.toFixed(4) + ' ' + move.tempo.toFixed(3);
    };
    globalThis.host_read_file = p => b.files[p] ?? null;
    globalThis.host_write_file = (p, c) => { b.files[p] = c; return true; };
    globalThis.host_ensure_dir = () => true;
    globalThis.clear_screen = () => { b.screen = []; };
    globalThis.print = (x, y, text) => b.screen.push(text);
    globalThis.text_width = t => t.length * 6;
    globalThis.fill_rect = () => {};
    globalThis.set_pixel = () => {};
    globalThis.set_font = () => true;

    await import(pathToFileURL(join(dir, 'ui.mjs')).href);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const msg = (...d) => globalThis.onMidiMessageInternal(d);
    const api = {
        b,
        async run(ms) { const end = Date.now() + ms; while (Date.now() < end) { globalThis.tick(); await sleep(2); } },
        pad: (row, col, on = true) => msg(on ? 0x90 : 0x80, 68 + row * 8 + col, on ? 100 : 0),
        step: (s, on = true) => msg(on ? 0x90 : 0x80, 16 + s, on ? 100 : 0),
        button: (cc, on = true) => msg(0xb0, cc, on ? 127 : 0),
        turn: (cc, detents) => { for (let i = 0; i < Math.abs(detents); i++) msg(0xb0, cc, detents > 0 ? 1 : 127); },
        padColor: (row, col) => b.leds.get(68 + row * 8 + col),
        hanging() {
            const on = new Map();
            for (const m of b.midi) { const k = m.ch + ':' + m.note; on.set(k, m.on ? 1 : 0); }
            return [...on].filter(([, v]) => v).map(([k]) => k);
        },
        text: () => b.screen.join(' | ')
    };
    globalThis.init();
    await api.run(50);
    return api;
}

export const CC = { SHIFT: 49, DELETE: 119, UNDO: 56, LOOP: 58, CAPTURE: 52, PLAY: 85, REC: 86, LEFT: 62, RIGHT: 63, MINUS: 54, PLUS: 55, JOG: 14, KNOB1: 71 };
