export const setLED = (note, color) => globalThis.__bloom.leds.set(note, color);
export const setButtonLED = (cc, color) => globalThis.__bloom.buttons.set(cc, color);
export const decodeDelta = v => (v === 0 ? 0 : v < 64 ? v : v - 128);
export const isNoiseMessage = () => false;
export const invalidateLedCache = () => {};
