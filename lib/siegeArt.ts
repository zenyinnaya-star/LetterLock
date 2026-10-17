// Generated Siege art (Higgsfield), served through Vercel's image optimizer.
import { img } from './mmArt';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  fieldWide: CDN + 'hf_20261017_180608_f17f9994-09e4-441d-9aa0-46f337178f3e.png',
  fieldTall: CDN + 'hf_20261017_180625_da619a1b-80e8-41d3-95fd-e43f4b0d68ab.png',
  tentWide: CDN + 'hf_20261017_180608_932f5f6f-7ef7-4ba9-a284-461cdae055e1.png',
  tentTall: CDN + 'hf_20261017_180608_c369ecb0-1842-42ca-820a-b9341f23dfef.png',
  iron: CDN + 'hf_20261017_180608_3ee9dae5-89ff-476d-8fbb-61cd5d1e4099.png',
  stone: CDN + 'hf_20261017_180624_158b5b20-a772-42a8-9176-2ae0788deda2.png',
  scroll: CDN + 'hf_20261017_180658_09247b8c-6ccc-4a09-a291-ee99958b90f2.png',
  ruins: CDN + 'hf_20261017_180658_9bee7018-49bd-4db9-a369-1e169e90fe4b.png',
};
const css = (u: string, w: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/siege.css */
export const siegeArtVars = {
  '--s-field-wide': css(src.fieldWide, 2048),
  '--s-field-tall': css(src.fieldTall, 1080),
  '--s-tent-wide': css(src.tentWide, 2048),
  '--s-tent-tall': css(src.tentTall, 1080),
  '--s-iron': css(src.iron, 1200),
  '--s-stone': css(src.stone, 128),
  '--s-scroll': css(src.scroll, 1200),
  '--s-ruins': css(src.ruins, 2048),
} as React.CSSProperties;
