## A settled control scheme

This release reorganises Bloom's controls so there's room to grow. From here on I'll try hard not to make big changes to navigation: new features will go into free slots (Shift + knob 8 is open, and Settings has room) rather than moving what you've already learned.

**What moved**

| Was | Now |
|---|---|
| Knob 4: Sound (on, muted, hold) | Shift + knob 4. Knob 4 is now **Gate**, matching a held step |
| Shift + knob 5 to 8: chord track, bass track, MIDI out, pad colours | **Settings**: tap Menu |
| Shift + Loop: play style | **Settings**: Play style |
| Shift + -/+: chord rows | Shift + knob 3. -/+ is octave only |

**The knobs now**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Knobs | Mode | Length | Speed | Gate | Volume | Bass | Spread | Feel |
| Shift + knobs | Key | Scale | Chord rows | Sound | Strum direction | Swing | Register | (free) |

The knobs mean the same thing whether or not you hold a step. **Hold Menu** to see what all eight do right now (with Shift for the Shift layer). **Tap Menu** for Settings.

## New

- **Settings** (tap Menu): chord track, bass track, MIDI out, pad colours, play style. Wheel to a row, click, turn, click.
- **Bloom's own key and scale** (Shift + knobs 1 and 2): try keys without leaving Bloom. A `*` shows while it differs from the Set's; changing the key on Move takes over again.
- **Strum direction**: up, down or alternating.
- **Swing** for arps and pulse, 50% to 75%.
- **Register** keeps pad chords near a low, middle or high pitch as smooth voice leading moves.
- **Gate** as a global knob for progression playback; steps can still set their own.
- **Record** now takes a live performance; **Shift + Record** records the progression.
- **MIDI out over USB-A**: Move, Move + USB, or USB (chords on channel 1, bass on 2).
- In Pulse the bass pulses with the chords.

## Better

- Chord colours combine one per kind (a sus/dim/aug, a 7th or 6th, and add9) instead of stacking: tap 7 then Maj7 and you get maj7.
- A colour tapped while holding a chord stays on it, so you can strum it; the strum plate stays on the last chord after you let go.
- Holding a colour and then pressing a chord plays it in that colour, also in Hold while another chord is still ringing.
- Changing a held chord's colour keeps the velocity you played it with, and saved steps keep their velocity.
- Loop range changes while playing land on the next bar.
- Play follows Move's clock even when Schwung's playing flag gets stuck; count-in is timed from the Record press.
- Fixes for Move 2.1.1 with Schwung 1.8 (echoed button presses, Record that only arms, stale track selection).
- Pad and button lights come back after presses Bloom passes on to Move.
