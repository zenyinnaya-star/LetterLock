// The robotic browser text-to-speech announcer is retired: Gideon (lib/narrator.ts) is the only voice.
// Kept as a no-op shim so existing call sites stay harmless.
export const announcer = {
  unlock() {},
  say(_text: string, _opts: { delay?: number; urgent?: boolean; hype?: boolean } = {}) {},
  stop() {},
};
