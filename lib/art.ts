// Higgsfield-generated art, hosted on their CDN until self-hosted copies land in /public/art.
const C = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
const u = (id: string) => `${C}${id}.png`;

export const HERO_SPRITE: Record<string, string> = {
  Shiro: u('20261007_225037_1235a3fa-29d3-4ca1-971e-f581fe0c00a1'),
  Nero: u('20261007_225038_9df82aa3-bae7-4a05-8a96-06d8247184ef'),
  Kira: u('20261007_225037_06533df7-72b6-469b-a41d-b14e23a154f7'),
  Mira: u('20261007_224939_9cf994b9-e97d-4f23-b899-6e1f963a81a1'),
  Prince: u('20261007_225038_38f2f5f7-08ce-4b59-81fc-2b6f1ad1df18'),
};

// keyed by enemy name as spawned by _spawn (042)
export const ENEMY_SPRITE: Record<string, string> = {
  'Intern Auditor': u('20261007_224939_f8915a1e-9e51-4505-a391-eb7ec7f9425d'),
  'Clerk': u('20261007_225111_2b801d7e-c155-4ccc-9b3a-3fa766e2f6b1'),
  'The Collector': u('20261007_225112_f1855ea9-ecf2-4ad6-9b30-fdcc48bc5420'),
  'Filer Alpha': u('20261007_224939_91a59d61-4b7c-4a4f-8df6-d53d44153068'),
  'Filer Beta': u('20261007_224939_91a59d61-4b7c-4a4f-8df6-d53d44153068'),
  'Bailiff': u('20261007_225111_9ca3dc4f-bc5f-4ede-97f9-787cc0b02c03'),
  'The Commissioner': u('20261007_224938_689165ae-692b-4583-9e14-3c830bad0cbf'),
  'Tax Drone': u('20261007_225112_339abbfd-4ac3-4efe-b7ec-eef8bd7c04aa'),
  'Government': u('20261007_225137_a5ef71e6-5418-487f-aa3c-7cdcb3b8d882'),
};

export const ACT_BG = [
  u('20261007_225137_993ab61a-972a-47b0-a407-b11885513dea'), // Act I
  u('20261007_225136_b7beb9b3-c613-45e8-b825-3a33cf3de2bd'), // Act II
  u('20261007_225206_4d9267ac-a714-4572-8685-af0370c473d2'), // Act III
];
export const BOOK_ART = u('20261007_225206_60e61d21-1757-49c8-8d5f-b722da83fa21');
export const actOf = (stage: number) => (stage <= 2 ? 0 : stage <= 4 ? 1 : 2);
export const ACT_NAME = ['Act I · The Outer Provinces', 'Act II · The Midlands', 'Act III · The Capital'];
