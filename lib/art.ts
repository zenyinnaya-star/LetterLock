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

// pixel-art hero poses: back view (over-the-shoulder battle) and victory
export const HERO_BACK: Record<string, string> = {
  Shiro: u('20261008_131437_218e776f-22a4-4136-a489-25ed55924ff4'),
  Nero: u('20261008_131506_390f4574-d492-447a-ad7a-a97136ae8200'),
  Kira: u('20261008_131505_98a4ddb4-4955-44c3-b813-0e0d3ab0d121'),
  Mira: u('20261008_131549_be3a452d-8caf-4721-afea-f0cbfe6290a6'),
  Prince: u('20261008_131436_0c2165e6-79e2-4942-aec7-12fcb76ee214'),
};
export const HERO_WIN: Record<string, string> = {
  Shiro: u('20261008_131437_565cae77-5fb3-4bb2-b787-3f4f493588d9'),
  Nero: u('20261008_131547_c6da2e92-92fb-4769-af97-88ef8633e487'),
  Kira: u('20261008_131435_e6316653-6d24-4802-9bc5-7b68c468bc27'),
  Mira: u('20261008_131547_414d9439-4b90-48bd-aa05-bba4a59219df'),
  Prince: u('20261008_131557_77e38682-c762-45f0-b605-f063d6372c2a'),
};

// attack / cast animation frames (swapped in while a unit acts)
export const HERO_STRIKE: Record<string, string> = {
  'Shiro': u('20261008_132044_45b0f30b-d39e-424c-b01a-ccf8df3b7adc'),
  'Nero': u('20261008_132043_433298b1-2aac-4dc5-9acc-5dbe2b4844fc'),
  'Kira': u('20261008_132045_61b2490e-9a61-4fa0-bc06-7483c8d91d07'),
  'Mira': u('20261008_132052_2feed035-8808-4372-8b82-42c503fed1d6'),
  'Prince': u('20261008_132117_3f930982-9c3e-4fcb-b98e-5704b5e3b75b'),
};
export const HERO_CAST: Record<string, string> = {
  'Shiro': u('20261008_132116_1d5eb801-a80a-4732-a583-0b0455261d2d'),
  'Nero': u('20261008_132116_832454fd-e7c4-43e5-aee4-4780896cf282'),
  'Kira': u('20261008_132145_da1922de-1bcd-4a36-b4ce-91d053c29a1a'),
  'Mira': u('20261008_132146_7c031210-7d63-46c5-9724-a61a55d6d09e'),
  'Prince': u('20261008_132146_e5360481-10d3-4d37-8416-a06fb9e2de3d'),
};
export const ENEMY_STRIKE: Record<string, string> = {
  'Intern Auditor': u('20261008_132214_c9de097b-d553-41ac-a393-021989fad0bb'),
  'Filer Alpha': u('20261008_132214_c9de097b-d553-41ac-a393-021989fad0bb'),
  'Clerk': u('20261008_132213_6b148394-c7bf-4e88-be96-0cda8f609280'),
  'Filer Beta': u('20261008_132213_6b148394-c7bf-4e88-be96-0cda8f609280'),
  'The Collector': u('20261008_132214_aa1b71cd-263e-4a9c-ad08-6c01bf7176a4'),
  'Bailiff': u('20261008_132256_67c89f6b-684e-4083-906a-4d7403b8b71f'),
  'Government': u('20261008_132257_25dd7a17-9c4b-48e8-9fcd-51fffafcb71c'),
};
