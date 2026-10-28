// Generated Classic comic UI kit (Higgsfield, background removed, blank where real text sits). Served via Vercel's image optimizer.
import { img } from './mmArt';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  panel: CDN + 'hf_20261028_183706_29cdcfb3-0f13-493c-8085-0688921987ab.png',
  hud: CDN + 'hf_20261028_183707_aef4ee80-4ed9-4e04-9bff-dac2c93a08bd.png',
  skyline: CDN + 'hf_20261028_183732_19d0226f-f306-4917-b9f5-c2bba596f66f.png',
  burstY: CDN + 'hf_20261028_183734_8011112d-6e60-47e4-bb9a-0275c7ececa6.png',
  button: CDN + 'hf_20261028_183755_30edd388-2090-4d25-bb63-c819ed73933e.png',
  burstP: CDN + 'hf_20261028_183757_043e9b99-29a1-4da8-aad5-ac495a7286c2.png',
  key: CDN + 'hf_20261028_183829_ec559934-9bbd-4dea-bec8-8851fd4235b9.png',
};
const css = (u: string, w: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/comic-kit.css */
export const comicKitVars = {
  '--k-panel': css(src.panel, 1200),
  '--k-hud': css(src.hud, 1920),
  '--k-skyline': css(src.skyline, 1920),
  '--k-burst-y': css(src.burstY, 384),
  '--k-button': css(src.button, 750),
  '--k-burst-p': css(src.burstP, 384),
  '--k-key': css(src.key, 256),
} as React.CSSProperties;
