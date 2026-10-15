// Soft "Coming Soon" lock on the PvE / Story mode. Client-side only: it hides the mode from casual players, it is not real security.
const HASHES = new Set([
  '812af6f1edfad6d6c5251b198d0b3c2242a303493eacc68b1a9cbe203163e883',
  '95319b18985b98e8b70b99436b2cba993c074e088442580e4089bb59e7d6ff0f',
  'e6853fcfbe45743959ddf8d0568f7e6e1ff67c8e305c89c456e9dcaa69c552be',
  '08e4d2499535a8ca91e6ed35e10b1048106b12306af2dedbba43405fe067529e',
]);
const KEY = 'll_pve_unlocked';

export function pveUnlocked(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export async function tryUnlockPve(input: string): Promise<boolean> {
  const norm = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!HASHES.has(hex)) return false;
  try { window.localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  return true;
}
