/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mastermind art is generated on Higgsfield; Vercel's image optimizer resizes, compresses and caches it.
  // every room code is served by the single static /room page (see app/room/page.tsx)
  async rewrites() { return [{ source: '/room/:code', destination: '/room' }]; },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'd8j0ntlcm91z4.cloudfront.net' }] },
};
export default nextConfig;
