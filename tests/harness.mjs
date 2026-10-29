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

export async function loadBloom({ noInfo = false, unknownTransport = false, recArmsOnly = false, staleSelected = -1, echo = false, key = 0, scale = 'Major', tempo = 120, settings = {}, inputModes = ['auto', 'auto', 'auto', 'auto'], countIn = false } = {}) {
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
        /* As reported (unconfirmed) on Move 2.1.1: injected buttons handed back to the module. */
        if (echo && (p[0] >> 4) === 0 && (p[1] & 0xf0) === 0xb0) setTimeout(() => globalThis.onMidiMessageInternal([p[1], p[2], p[3]]), 5);
        if ((p[0] >> 4) === 2) { b.midi.push({ t: Date.now(), on: (p[1] & 0xf0) === 0x90, ch: p[1] & 15, note: p[2], vel: p[3] }); return; }
        if (p[3] !== 127) return;
        b.controls.push(p[2]);
        if (p[2] >= 40 && p[2] <= 43) move.selected = 43 - p[2];
        const start = () => { move.playing = true; move.startedAt = Date.now(); };
        /* Record starts a stopped Move (or only arms it, as on Move 2.1.1); a running Move keeps going. */
        if (p[2] === 86) { if (move.armed) move.armed = false; else if (!move.playing && recArmsOnly) move.armed = true; else if (!move.playing) setTimeout(start, 20); }
        if (p[2] === 85) { const was = move.playing; setTimeout(() => (was ? (move.playing = false) : start()), 20); }
    };
    /* USB-A out: refuses while b.usbFull is above zero, like Schwung's ring when it fills. */
    b.usb = []; b.usbFull = 0;
    globalThis.move_midi_external_send = p => {
        if (b.usbFull > 0) { b.usbFull--; return false; }
        b.usb.push({ t: Date.now(), type: p[1] & 0xf0, on: (p[1] & 0xf0) === 0x90, ch: p[1] & 15, note: p[2], vel: p[3] });
        return true;
    };
    /* As Schwung publishes it: 0/1 flags, 255 when unknown (the transport on firmware it does not know). */
    globalThis.host_get_move_info = () => noInfo ? null : move.invalid ? { valid: 0, playing: 255, selectedTrack: -1, tracks: [0, 1, 2, 3].map(() => ({ selected: 255 })) } : ({
        valid: 1, playing: unknownTransport ? 255 : move.infoPlaying ?? (move.playing ? 1 : 0), rootNote: move.key, scale: move.scale, tempo: move.tempo, tsUpper: 4,
        selectedTrack: staleSelected >= 0 ? staleSelected : move.selected,
        tracks: [0, 1, 2, 3].map(i => ({ selected: i === (staleSelected >= 0 ? staleSelected : move.selected) ? 1 : 0 }))
    });
    /* Bloom's DSP: Move's beat position while playing, -1 when stopped. */
    globalThis.host_module_get_param = key => {
        if (key !== 'clock' || !move.clock) return null;
        const beat = move.playing ? (Date.now() - move.startedAt) / (60000 / move.tempo) : -1;
        return beat.toFixed(4) + ' ' + move.tempo.toFixed(3);
    };
    globalThis.shadow_set_overtake_suppress_master_volume = v => { b.volumeOwned = v; };
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
        pad: (row, col, on = true, vel = 100) => msg(on ? 0x90 : 0x80, 68 + row * 8 + col, on ? vel : 0),
        step: (s, on = true) => msg(on ? 0x90 : 0x80, 16 + s, on ? 100 : 0),
        button: (cc, on = true) => msg(0xb0, cc, on ? 127 : 0),
        turn: (cc, detents) => { for (let i = 0; i < Math.abs(detents); i++) msg(0xb0, cc, detents > 0 ? 1 : 127); },
        /* Settings list: tap Menu, wheel to row i, click, wheel by dir, click, tap Menu to close. */
        setting(i, dir) {
            const tap = cc => { msg(0xb0, cc, 127); msg(0xb0, cc, 0); };
            tap(CC.MENU); api.turn(CC.JOG, -8); api.turn(CC.JOG, i);
            tap(CC.JOG_CLICK); api.turn(CC.JOG, dir); tap(CC.JOG_CLICK); tap(CC.MENU);
        },
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

export const CC = { SHIFT: 49, DELETE: 119, UNDO: 56, LOOP: 58, CAPTURE: 52, PLAY: 85, REC: 86, LEFT: 62, RIGHT: 63, MINUS: 54, PLUS: 55, JOG: 14, JOG_CLICK: 3, MENU: 50, BACK: 51, KNOB1: 71 };
