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
  Enforcer: N('20261008_062731_c86d8429-e9ca-48b6-9564-acee90c1f734'),
  Bureaucrat: N('20261008_062733_966578a9-9f82-4b18-bf3f-1a924afccddc'),
  Collector: N('20261008_062735_5e8406af-8a8a-4022-8f5b-f36d09ca2fd1'),
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
  u('20261008_063230_a2fc942c-aa7e-4fd8-a762-f4b783fba606'), // Act I · harbor
  u('20261008_063231_eadd574b-4745-4cb3-8d40-8a18831b54e3'), // Act II · archive fortress
  u('20261008_063315_05cd6739-2de4-45ea-bc87-3466756ea0e0'), // Act III · citadel
];
export const MENU_BG = u('20261008_063255_20876ecb-71fb-47e1-abb5-86be76caf752');
export const HERO_BG = u('20261008_063230_5d2b88fe-8bdd-4a43-a030-dcad86f63b89');
export const BOOK_ART = u('20261008_063230_8c35b853-eb22-4ed6-b263-f0377c6d91f3');
export const actOf = (stage: number) => (stage <= 2 ? 0 : stage <= 4 ? 1 : 2);
export const ACT_NAME = ['Act I · The Outer Provinces', 'Act II · The Midlands', 'Act III · The Capital'];
