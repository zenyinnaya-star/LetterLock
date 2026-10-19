// Invite links/QR codes must open for everyone. Vercel branch previews sit behind a login wall,
// so on a preview host we hand out the public production address instead (same database, same rooms).
const PUBLIC_ORIGIN = 'https://letterlock-theta.vercel.app';
export function shareOrigin(): string {
  if (typeof window === 'undefined') return PUBLIC_ORIGIN;
  const h = window.location.hostname;
  return h.endsWith('.vercel.app') && h !== new URL(PUBLIC_ORIGIN).hostname ? PUBLIC_ORIGIN : window.location.origin;
}
