// Generated Western duel art (Higgsfield), served through Vercel's image optimizer (resized + cached).
import { img } from './mmArt';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  streetTall: CDN + 'hf_20261017_052647_8c56afcb-1669-4e81-8a53-ffb06af63264.png',
  streetWide: CDN + 'hf_20261018_053229_e3516dde-12db-43a2-8e14-5bfa2524bae3.png',
  poster: CDN + 'hf_20261017_052811_29db68db-fe18-4778-aff8-8eb2c90ae65f.png', // background removed
  note: CDN + 'hf_20261017_052647_1cab985c-ad39-46e3-8020-2bab97fed529.png',
  clock: CDN + 'hf_20261017_052647_5b16cb21-e5a6-4cf3-b366-7cfa54e8ca52.png',
  leather: CDN + 'hf_20261017_052706_32989f88-42a6-4f85-8855-aa976f669c76.png',
  portrait: CDN + 'hf_20261017_052706_0812edf5-6e1a-4efa-8e69-1818b7f07282.png',
  saloonWide: CDN + 'hf_20261018_053229_4e94b46f-ac7b-4764-87d4-4575377989e0.png',
  saloonTall: CDN + 'hf_20261017_054629_98881217-f92a-43ac-a96d-986cb9b5d421.png',
  loss: CDN + 'hf_20261018_054536_14f4083c-bcd0-4835-911c-2886554eb5fe.png',
  sign: CDN + 'hf_20261017_054630_f7d08f39-416f-4732-b2b9-54bc32b6f0ae.png',
};
const css = (u: string, w: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/west.css */
export const westArtVars = {
  '--w-street-tall': css(src.streetTall, 1080),
  '--w-street-wide': css(src.streetWide, 2048),
  '--w-poster': css(src.poster, 640),
  '--w-note': css(src.note, 640),
  '--w-clock': css(src.clock, 256),
  '--w-leather': css(src.leather, 1200),
  '--w-portrait': css(src.portrait, 256),
  '--w-saloon-wide': css(src.saloonWide, 2048),
  '--w-saloon-tall': css(src.saloonTall, 1080),
  '--w-sign': css(src.sign, 640),
  '--w-loss': css(src.loss, 2048),
} as React.CSSProperties;
