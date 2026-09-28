// Downloads the Higgsfield-generated art into public/art at build time.
// Never fails the build: if a download fails, the CSS falls back to plain colours.
import { mkdir, writeFile, access } from 'node:fs/promises';

const BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20260928_163200_';
const ART = {
  'felt.webp': 'd335b3c0-584a-4b15-b8dd-d0e4aa1229d5_min.webp',
  'hero.webp': '0ad67007-6f71-4c97-b705-f65ecc0fcd92_min.webp',
  'duel.webp': '08272df9-9021-4d4c-9e8d-806101875c26_min.webp',
};

await mkdir('public/art', { recursive: true });
for (const [name, file] of Object.entries(ART)) {
  const out = `public/art/${name}`;
  try { await access(out); console.log(`art: ${name} already present`); continue; } catch { /* download */ }
  try {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    console.log(`art: ${name} downloaded`);
  } catch (e) {
    console.warn(`art: ${name} skipped (${e.message})`);
  }
}
