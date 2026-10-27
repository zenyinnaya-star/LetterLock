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

// Comic Pop class portraits: downsized to 512px webp so HUD icons stay light. Skipped quietly on failure.
const COMIC = {
  'ninja': 'hf_20261027_035734_bae32255-9325-42ec-a302-121177a0d76f.png',
  'mastermind': 'hf_20261027_035648_b64dc638-5e47-461d-9013-01fb6172b92d.png',
  'hero': 'hf_20261027_035647_95a6c985-3173-4978-8974-9f24bff2bbe2.png',
  'villain': 'hf_20261027_035819_2d2393ce-5945-4848-8e1e-2b6bea88d619.png',
  'hacker': 'hf_20261027_035648_6257e2f0-0a6c-4bd1-9404-9cb37797cfee.png',
  'thief': 'hf_20261027_035647_2c5aa729-1a1c-4c18-bfdc-bf081d15db92.png',
  'jester': 'hf_20261027_174112_4c8d23db-cbec-47f3-9a4c-3e4245731dfe.png',
  'parasite': 'hf_20261027_173945_a446d2e3-b3aa-431e-a5df-5f07bf21ea1d.png',
  'wildcard': 'hf_20261027_173943_f6b23a33-9712-4831-8fb7-d67980932ae5.png',
  'oracle': 'hf_20261027_174112_7cd0a925-69e8-42b5-a59b-9e5d68fa237e.png',
  'gambler': 'hf_20261027_173945_44fbd97d-ac69-4fd0-98c3-6238436ba52c.png',
  'mimic': 'hf_20261027_173944_8c295f7c-a512-44b1-a4cf-f0e44eaeced2.png',
};
await mkdir('public/art/comic', { recursive: true });
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { console.warn('art: sharp unavailable, saving comic portraits at full size'); }
{
  await Promise.all(Object.entries(COMIC).map(async ([cls, file]) => {
    const out = `public/art/comic/class-${cls}.webp`;
    try { await access(out); return; } catch { /* download */ }
    try {
      const res = await fetch(BASE + file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = Buffer.from(await res.arrayBuffer());
      const buf = sharp ? await sharp(raw).resize(512, 512).webp({ quality: 82 }).toBuffer() : raw;
      await writeFile(out, buf);
      console.log(`art: comic ${cls} ready`);
    } catch (e) { console.warn(`art: comic ${cls} skipped (${e.message})`); }
  }));
}
