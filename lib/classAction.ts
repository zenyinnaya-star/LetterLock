// Action scenes for the class-select screen. Hosted on the Higgsfield CDN for now;
// to self-host, save each into /public/art/action-<class>.webp and the local file wins.
import type { PlayerClass } from './types';

export const ACTION_ART: Record<PlayerClass, string> = {
  ninja: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045151_bda98906-3ee6-4b06-a109-516388fbd422.png',
  mastermind: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045151_2717fb75-5d74-4eac-8e32-82586ff0aa7e.png',
  hero: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045151_ca823bc7-bf5c-4f58-bb27-e25388b80f90.png',
  villain: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045152_120e6b33-ae31-497a-87f0-b45ca6518dcf.png',
  hacker: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045214_ef20c7de-853c-42dd-8d1d-84b655ff3e2e.png',
  mimic: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045214_66f24663-fa47-48ef-8989-a84a6ec45b19.png',
  gambler: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045214_e37ecf60-f62f-4077-9c45-e678e26acf92.png',
  thief: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045214_d02398be-ea80-4b1f-b08d-31ec93f6cfad.png',
  parasite: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045240_43902864-c749-4004-b3b9-50f0e319aca5.png',
  oracle: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045240_eab883bb-7fb1-4901-bb15-081d1b815c24.png',
  wildcard: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045241_64ec68bc-eb57-4e44-a267-4a0b7e6c90ba.png',
  jester: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_045241_ab7b117f-54ed-4dfd-8d8a-465f87b7a7f0.png',
};

/** Comic Pop portraits (Higgsfield CDN for now; save as /public/art/comic/class-<class>.webp to self-host). */
export const COMIC_ART: Partial<Record<PlayerClass, string>> = {
  ninja: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_035734_bae32255-9325-42ec-a302-121177a0d76f.png',
  mastermind: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_035648_b64dc638-5e47-461d-9013-01fb6172b92d.png',
  hero: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_035647_95a6c985-3173-4978-8974-9f24bff2bbe2.png',
  villain: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_035819_2d2393ce-5945-4848-8e1e-2b6bea88d619.png',
  hacker: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_035648_6257e2f0-0a6c-4bd1-9404-9cb37797cfee.png',
  thief: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_035647_2c5aa729-1a1c-4c18-bfdc-bf081d15db92.png',
};

/** Order to try: local self-hosted file, then the CDN scene, then the portrait. */
export function actionSources(c: PlayerClass): string[] {
  const comic = COMIC_ART[c];
  return [`/art/comic/class-${c}.webp`, ...(comic ? [comic] : []), `/art/action-${c}.webp`, ACTION_ART[c], `/art/class-${c}.webp`];
}
