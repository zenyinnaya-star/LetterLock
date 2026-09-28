// Downloads the Higgsfield-generated art into public/art at build time.
// Never fails the build: if a download fails, the UI falls back to CSS colours / SVG badges.
import { mkdir, writeFile, access } from 'node:fs/promises';

const BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const ART = {
  'felt.webp': 'hf_20260928_163200_d335b3c0-584a-4b15-b8dd-d0e4aa1229d5_min.webp',
  'hero.webp': 'hf_20260928_163200_0ad67007-6f71-4c97-b705-f65ecc0fcd92_min.webp',
  'duel.webp': 'hf_20260928_163200_08272df9-9021-4d4c-9e8d-806101875c26_min.webp',
  'victory.webp': 'hf_20260928_205859_836a72c3-03d5-43f3-b312-66f28d9af692_min.webp',
  'lobby.webp': 'hf_20260928_205859_3f7e9378-aef9-4c7b-973f-8faf1f87d969_min.webp',
  'class-ninja.webp': 'hf_20260928_210229_71e1903d-85ea-4efc-92dd-2fb0f0419db8_min.webp',
  'class-mastermind.webp': 'hf_20260928_181054_ec7f7e77-aff3-4de4-ba80-3d4142146406_min.webp',
  'class-hero.webp': 'hf_20260928_205859_5b62ef34-e477-431b-a653-a8adf717867c_min.webp',
  'class-villain.webp': 'hf_20260928_205859_7786997d-5adc-4644-bc6c-5f34a50f35f2_min.webp',
  'class-hacker.webp': 'hf_20260928_210229_7970a9a0-2c09-40a3-994c-86c6848bec35_min.webp',
  'class-mimic.webp': 'hf_20260928_214600_b163912b-a4ea-4ad8-b45a-4df17363fbbd_min.webp',
  'class-gambler.webp': 'hf_20260928_213508_df02548c-5e95-4fef-aaf1-8f3a41c45f6e_min.webp',
  'class-thief.webp': 'hf_20260928_214602_227e17d7-cfbc-46fc-bee0-e1172f3a6a41_min.webp',
  'class-parasite.webp': 'hf_20260928_213508_c55d7ff8-2a96-45ce-baf4-d6c5bd4242a6_min.webp',
  'class-oracle.webp': 'hf_20260928_213509_32adcdd7-a01e-4fe8-b76e-b0c2ecffc4f3_min.webp',
  'class-wildcard.webp': 'hf_20260928_213508_6a94e34c-ee38-46ed-9a83-3762d830b75b_min.webp',
  'class-jester.webp': 'hf_20260928_213508_bcb9b8e6-2615-4d9c-86ed-ef9a96725f12_min.webp',
};

await mkdir('public/art', { recursive: true });
await Promise.all(Object.entries(ART).map(async ([name, file]) => {
  const out = `public/art/${name}`;
  try { await access(out); console.log(`art: ${name} already present`); return; } catch { /* download */ }
  try {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    console.log(`art: ${name} downloaded`);
  } catch (e) {
    console.warn(`art: ${name} skipped (${e.message})`);
  }
}));
