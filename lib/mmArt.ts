// Generated Mastermind art (Higgsfield), served through Vercel's image optimizer so it arrives resized and cached.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  roomWide: CDN + 'hf_20261018_053234_2c31da60-3695-4d68-b708-f26fd3ead8b1.png',
  brass: CDN + 'hf_20261018_161526_245f0d79-4acb-48ff-9233-737a1245f6f3.png',
  plaque: CDN + 'hf_20261018_161525_7bc15eb6-21bf-4f05-942e-4b4d980c60e2.png',
  cork: CDN + 'hf_20261018_054536_ec1cc642-346b-4a1a-aad4-49f70459c903.png',
  folder: CDN + 'hf_20261016_170206_5cb01c21-b55a-4cf2-b589-3c97500c3f15.png',
  silhouette: CDN + 'hf_20261016_170055_40d173ce-3955-4727-b5eb-bc140d1fb586.png',
  polaroid: CDN + 'hf_20261016_170055_b6d7279f-5bea-4fc4-b89b-1180a794fcd9.png',
};
const WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]; // Next only serves its configured widths; anything else 400s
export const img = (u: string, w = 1920) => `/_next/image?url=${encodeURIComponent(u)}&w=${WIDTHS.find((x) => x >= w) ?? 3840}&q=75`; // Next 16 only accepts the configured qualities (default [75])
const css = (u: string, w?: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/mastermind/mastermind.css */
export const mmArtVars = {
  '--art-room-wide': css(src.roomWide, 2048),
  '--art-room-tall': "url('/art/mm-room.jpg')",
  '--art-cork': css(src.cork, 1200),
  '--art-brass': css(src.brass, 1200),
  '--art-plaque': css(src.plaque, 640),
  '--art-folder': css(src.folder, 1200),
  '--art-sil': css(src.silhouette, 384),
  '--art-polaroid': css(src.polaroid, 384),
  '--mk-room': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_182417_a98d58d7-bf33-47a9-9051-e9901eff65d5.png', 2048),
  '--mk-folder': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_182519_b88441fa-03df-4b6e-b84d-5f0fe2ace8f0.png', 1200),
  '--mk-polaroid': css('https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261030_182537_ff69af91-b1b9-4ade-810f-bea0f84e6690.png', 500),
} as React.CSSProperties;
