// Higgsfield-generated art, hosted on their CDN until self-hosted copies land in /public/art.
const C = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
const u = (id: string) => `${C}${id}.png`;

// v2 cel-shaded sprites (2026-10-08)
const N = (id: string) => `${C}${id}.png`;
const S2 = {
  Shiro: N('20261008_015326_684f5384-e54e-4848-becb-2a1471d0ab6e'),
  Nero: N('20261008_015254_a3d67e43-a3ff-42d7-8e5d-7b2e128d774b'),
  Kira: N('20261008_015256_276e1e64-48fb-47e4-92fb-53a72734886f'),
  Mira: N('20261008_015258_4c233066-9d98-45af-94f0-5a78fdeb0699'),
  Prince: N('20261008_015300_99da7422-382b-41c2-b12b-158e44632523'),
  Government: N('20261008_015328_a02c0825-4ff3-4843-b7fe-6709b5000a89'),
  Auditor: N('20261008_015330_977b7004-0014-417e-ad36-7caa03fa44b6'),
  Enforcer: N('20261008_014539_a1c5dee7-b5d6-40e3-8fab-f8a77117688b'),
  Bureaucrat: N('20261008_014538_d9f320b3-3101-448e-96fd-e9c5f775cd41'),
  Collector: N('20261008_014539_bfab3d5b-3d6a-4a20-9e97-0421d81a27e2'),
};

export const HERO_SPRITE: Record<string, string> = {
  Shiro: S2.Shiro,
  Nero: S2.Nero,
  Kira: S2.Kira,
  Mira: S2.Mira,
  Prince: S2.Prince,
};

// keyed by enemy name as spawned by _spawn (042)
export const ENEMY_SPRITE: Record<string, string> = {
  'Intern Auditor': S2.Auditor,
  'Clerk': S2.Bureaucrat,
  'The Collector': S2.Collector,
  'Filer Alpha': S2.Auditor,
  'Filer Beta': S2.Bureaucrat,
  'Bailiff': S2.Enforcer,
  'The Commissioner': u('20261007_224938_689165ae-692b-4583-9e14-3c830bad0cbf'),
  'Tax Drone': u('20261007_225112_339abbfd-4ac3-4efe-b7ec-eef8bd7c04aa'),
  'Government': S2.Government,
};

export const ACT_BG = [
  u('20261007_225137_993ab61a-972a-47b0-a407-b11885513dea'), // Act I
  u('20261007_225136_b7beb9b3-c613-45e8-b825-3a33cf3de2bd'), // Act II
  u('20261007_225206_4d9267ac-a714-4572-8685-af0370c473d2'), // Act III
];
export const BOOK_ART = u('20261007_225206_60e61d21-1757-49c8-8d5f-b722da83fa21');
export const actOf = (stage: number) => (stage <= 2 ? 0 : stage <= 4 ? 1 : 2);
export const ACT_NAME = ['Act I · The Outer Provinces', 'Act II · The Midlands', 'Act III · The Capital'];
