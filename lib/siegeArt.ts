// Generated Siege art (Higgsfield), served through Vercel's image optimizer.
import { img } from './mmArt';
import { westArtVars } from './westArt';
import { comicKitVars } from './comicKit';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  fieldWide: CDN + 'hf_20261018_053246_c1277b08-2027-4d6d-a1ac-7dc26f4d975c.png',
  fieldTall: CDN + 'hf_20261017_180625_da619a1b-80e8-41d3-95fd-e43f4b0d68ab.png',
  tentWide: CDN + 'hf_20261018_053229_0ee64d2f-fb64-498e-b783-0cc9b1b187c0.png',
  tentTall: CDN + 'hf_20261017_180608_c369ecb0-1842-42ca-820a-b9341f23dfef.png',
  iron: CDN + 'hf_20261017_180608_3ee9dae5-89ff-476d-8fbb-61cd5d1e4099.png',
  stone: CDN + 'hf_20261017_180624_158b5b20-a772-42a8-9176-2ae0788deda2.png',
  scroll: CDN + 'hf_20261017_180658_09247b8c-6ccc-4a09-a291-ee99958b90f2.png',
  ruins: CDN + 'hf_20261017_180658_9bee7018-49bd-4db9-a369-1e169e90fe4b.png',
};
const css = (u: string, w: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/siege.css */
export const siegeArtVars = {
  ...westArtVars,
  ...comicKitVars,
  '--s-field-wide': css(src.fieldWide, 2048),
  '--s-field-tall': css(src.fieldTall, 1080),
  '--s-tent-wide': css(src.tentWide, 2048),
  '--s-tent-tall': css(src.tentTall, 1080),
  '--s-iron': css(src.iron, 1200),
  '--s-stone': css(src.stone, 128),
  '--s-scroll': css(src.scroll, 1200),
  '--s-ruins': css(src.ruins, 2048),
  '--sk-field': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_182425_ad08ecdc-5cb9-46fe-a9ef-7e8ea18395b0.png', 2048),
  '--sk-red': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_182452_44668eec-f715-4a69-ba92-163da67a43e1.png', 828),
  '--sk-blue': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_182455_5c9c0a95-218c-4abb-aff6-850e7428d0aa.png', 828),
  '--sk-castle-r': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_192105_8a82d858-37bd-433a-b94e-5d95572f508f.png', 828),
  '--sk-castle-b': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_192106_0928d6c2-87ac-4617-adba-095e07cbf62a.png', 828),
  '--sk-plaque': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_192108_8f3e0615-cfdf-4fb9-b246-c5c8ee07563b.png', 1080),
  '--sk-lobby': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_192026_86105bc3-bf90-424f-a7d3-61c8e8fe2b02.png', 2048),
} as React.CSSProperties;
