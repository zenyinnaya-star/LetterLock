// Generated Mastermind art (Higgsfield), served through Vercel's image optimizer so it arrives resized and cached.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/';
const src = {
  roomWide: CDN + 'hf_20261018_053234_2c31da60-3695-4d68-b708-f26fd3ead8b1.png',
  folder: CDN + 'hf_20261016_170206_5cb01c21-b55a-4cf2-b589-3c97500c3f15.png',
  silhouette: CDN + 'hf_20261016_170055_40d173ce-3955-4727-b5eb-bc140d1fb586.png',
  polaroid: CDN + 'hf_20261016_170055_b6d7279f-5bea-4fc4-b89b-1180a794fcd9.png',
};
export const img = (u: string, w = 1920) => `/_next/image?url=${encodeURIComponent(u)}&w=${w}&q=75`; // Next 16 only accepts the configured qualities (default [75])
const css = (u: string, w?: number) => `url("${img(u, w)}")`;

/** CSS custom properties consumed by app/mastermind/mastermind.css */
export const mmArtVars = {
  '--art-room-wide': css(src.roomWide, 2048),
  '--art-room-tall': "url('/art/mm-room.jpg')",
  '--art-folder': css(src.folder, 1200),
  '--art-sil': css(src.silhouette, 384),
  '--art-polaroid': css(src.polaroid, 384),
} as React.CSSProperties;
