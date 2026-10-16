/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mastermind art is generated on Higgsfield; Vercel's image optimizer resizes, compresses and caches it.
  images: { remotePatterns: [{ protocol: 'https', hostname: 'd8j0ntlcm91z4.cloudfront.net' }] },
};
export default nextConfig;
