/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The private `staging` branch builds with every mode unlocked so new work can be tested; main / production stay Classic-only.
  env: { NEXT_PUBLIC_CLASSIC_ONLY: process.env.VERCEL_GIT_COMMIT_REF === 'staging' ? 'false' : (process.env.NEXT_PUBLIC_CLASSIC_ONLY ?? 'true') },
  // Mastermind art is generated on Higgsfield; Vercel's image optimizer resizes, compresses and caches it.
  // every room code is served by the single static /room page (see app/room/page.tsx)
  async rewrites() { return [{ source: '/room/:code', destination: '/room' }]; },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'd8j0ntlcm91z4.cloudfront.net' }] },
};
export default nextConfig;
