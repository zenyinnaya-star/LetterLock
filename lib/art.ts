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
export const PIXEL_BG = [
  'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261008_131257_851376aa-3c7c-4b25-92af-b27a37825f08.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261008_131257_d1ae0087-97b5-4bc9-b638-79d33ecdc3b7.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261008_131258_29ad1a30-0fb6-4b7f-9daf-c078a820e43e.png',
]; // 16-bit pixel-art battle backdrops, one per act
export const MENU_BG = u('20261008_063255_20876ecb-71fb-47e1-abb5-86be76caf752');
export const HERO_BG = u('20261008_063230_5d2b88fe-8bdd-4a43-a030-dcad86f63b89');
export const BOOK_ART = u('20261008_063230_8c35b853-eb22-4ed6-b263-f0377c6d91f3');
export const actOf = (stage: number) => (stage <= 2 ? 0 : stage <= 4 ? 1 : 2);
export const ACT_NAME = ['Act I · The Outer Provinces', 'Act II · The Midlands', 'Act III · The Capital'];

// pixel-art poses, backgrounds removed (2026-10-08)
export const HERO_BACK: Record<string, string> = {
  'Shiro': u('20261008_162642_06761fb6-c1c2-4e4c-87c0-7f60fecb834f'),
  'Nero': u('20261008_162644_e500d7ca-7c25-4029-aebc-1c05a57b4ff5'),
  'Kira': u('20261008_162645_791df225-9473-4cd0-a4ac-d58a0025a65f'),
  'Mira': u('20261008_162648_ab670073-e7c7-458e-a01a-27f58819dd64'),
  'Prince': u('20261008_162707_8975dfdb-1d82-4e7c-8b5c-adc314175d22'),
};
export const HERO_WIN: Record<string, string> = {
  'Shiro': u('20261008_162709_96e3bda2-f7d7-4f63-ae7b-3a4ca42803c1'),
  'Nero': u('20261008_162711_ba89539b-f3b6-475b-acfa-c9909d4713c2'),
  'Kira': u('20261008_162714_1ab9101b-0e58-4069-80e2-17e53f272e95'),
  'Mira': u('20261008_162742_cbb0907e-62a2-4d22-b94c-2da9a091e0e2'),
  'Prince': u('20261008_162745_2e73bdc6-fa5f-44b3-9230-2974a645247e'),
};
export const HERO_STRIKE: Record<string, string> = {
  'Shiro': u('20261008_162504_472fe7bf-52ef-4272-9ba6-14ece981dfab'),
  'Nero': u('20261008_162533_294f1a1e-b4fb-477a-9501-01531ca14b00'),
  'Kira': u('20261008_162617_95cb5585-2a33-442e-b456-a48d847a1865'),
  'Mira': u('20261008_162618_a13a7e7d-142e-47c1-986e-013d54de9016'),
  'Prince': u('20261008_162620_67901412-abb1-4e7c-8ccc-82ff6065cbe3'),
};
export const HERO_CAST: Record<string, string> = {
  'Shiro': u('20261008_162623_5a5f9dcf-c1a9-4053-8655-3791c56b8a81'),
  'Nero': u('20261008_162545_f9824450-2563-4be5-bec3-cb427caec00f'),
  'Kira': u('20261008_162548_ad11884d-2d97-4178-ac9e-89e37a7af875'),
  'Mira': u('20261008_162549_6516b53b-430b-4c4e-9764-0569d591155f'),
  'Prince': u('20261008_162551_70269d2e-7ca4-44d2-ac2a-bde0f1e8d45e'),
};
export const ENEMY_PIXEL: Record<string, string> = {
  'Intern Auditor': u('20261008_162746_c1e0a926-7a26-4cb6-9530-fe9005397a21'),
  'Filer Alpha': u('20261008_162746_c1e0a926-7a26-4cb6-9530-fe9005397a21'),
  'Clerk': u('20261008_162748_9739e69f-190a-41b1-89d3-72faccd40396'),
  'Filer Beta': u('20261008_162748_9739e69f-190a-41b1-89d3-72faccd40396'),
  'The Collector': u('20261008_162824_dde09f22-e759-46ea-a83b-53d003d6f123'),
  'Bailiff': u('20261008_162903_e0ff2743-7e9a-48db-8997-d33fe6954de9'),
  'The Commissioner': u('20261008_162907_81022161-4525-41b0-8004-f090e0426566'),
  'Tax Drone': u('20261008_162946_bd8c2c87-8d0d-4ab2-8524-26a070982b6a'),
  'Government': u('20261008_162905_0347b7c0-6524-41d4-8b00-b82c846e04a7'),
};
export const ENEMY_STRIKE: Record<string, string> = {
  'Intern Auditor': u('20261008_163053_50807779-dc82-428d-b6fa-469a003267ba'),
  'Filer Alpha': u('20261008_163053_50807779-dc82-428d-b6fa-469a003267ba'),
  'Clerk': u('20261008_163055_1e5d4061-b3a2-4597-b3cf-c4292c5b3a02'),
  'Filer Beta': u('20261008_163055_1e5d4061-b3a2-4597-b3cf-c4292c5b3a02'),
  'The Collector': u('20261008_163057_49c3ee12-6941-4d2b-8cdb-35af60124ce0'),
  'Bailiff': u('20261008_163059_c7a6b4fe-0f77-49d0-bf60-3f7a54a681f8'),
  'The Commissioner': u('20261008_163122_57445333-0c09-4794-944a-c3279b36c317'),
  'Tax Drone': u('20261008_163149_9ad765f4-ce21-4ffb-8b59-5e829103229f'),
  'Government': u('20261008_163121_53fef8f3-1087-4eaf-a4fd-fe8d6945ee11'),
};
