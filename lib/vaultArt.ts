// Generated vault-heist art (Higgsfield), served through Vercel's image optimizer.
import { img } from './mmArt';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  cctv: CDN + 'hf_20261018_161525_c1a6509b-137b-492d-9511-d7fe1e6e6ac7.png',
  blueprint: CDN + 'hf_20261018_161526_02f92cb2-6a29-498b-beda-5e18319d2909.png',
  officeWide: CDN + 'hf_20261017_232726_36c0d679-51eb-477c-9092-641e43961dde.png',
  officeTall: CDN + 'hf_20261017_232726_c72f1e45-8600-4e20-abfc-a350fa7c30fa.png',
  vaultWide: CDN + 'hf_20261018_162706_889190cc-e9cc-409a-86a8-a4fa2d88cd19.png',
  vaultTall: CDN + 'hf_20261018_162706_889190cc-e9cc-409a-86a8-a4fa2d88cd19.png',
  gold: CDN + 'hf_20261017_232726_6dc70e60-59f4-4d10-ab19-c71d9eee3f68.png',
  alarm: CDN + 'hf_20261017_232754_ac66b277-e87d-4dcc-af7e-e68bb8238570.png',
};
const css = (u: string, w: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/vault.css */
export const vaultArtVars = {
  '--v-office-wide': css(src.officeWide, 2048),
  '--v-cctv': css(src.cctv, 1200),
  '--v-blueprint': css(src.blueprint, 1080),
  '--v-office-tall': css(src.officeTall, 1080),
  '--v-vault-wide': css(src.vaultWide, 2048),
  '--v-vault-tall': css(src.vaultTall, 1080),
  '--v-gold': css(src.gold, 2048),
  '--v-alarm': css(src.alarm, 2048),
} as React.CSSProperties;
