// Higgsfield-generated art, hosted on their CDN until self-hosted copies land in /public/art.
const C = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
const u = (id: string) => `${C}${id}.png`;

// v2 cel-shaded sprites (2026-10-08)
const N = (id: string) => `${C}${id}.png`;
const S2 = {
  Shiro: N('20261008_014229_5ae93eb2-b608-49cb-b769-ada896926255'),
  Government: N('20261008_014523_9bb17cc4-2ee2-4e29-bece-72e21434d6d6'),
  Auditor: N('20261008_014539_3cb98a37-589c-4a58-9245-4bb0c79ae166'),
  Enforcer: N('20261008_014539_a1c5dee7-b5d6-40e3-8fab-f8a77117688b'),
  Bureaucrat: N('20261008_014538_d9f320b3-3101-448e-96fd-e9c5f775cd41'),
  Collector: N('20261008_014539_bfab3d5b-3d6a-4a20-9e97-0421d81a27e2'),
};

export const HERO_SPRITE: Record<string, string> = {
  Shiro: S2.Shiro,
  Nero: u('20261007_225038_9df82aa3-bae7-4a05-8a96-06d8247184ef'),
  Kira: u('20261007_225037_06533df7-72b6-469b-a41d-b14e23a154f7'),
  Mira: u('20261007_224939_9cf994b9-e97d-4f23-b899-6e1f963a81a1'),
  Prince: u('20261007_225038_38f2f5f7-08ce-4b59-81fc-2b6f1ad1df18'),
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
