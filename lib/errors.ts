import en from './i18n/en';
import { t, type Key } from './i18n';

const ERROR_CODES = Object.keys(en).filter((k) => k.startsWith('er.') && /^er\.[A-Z_]+$/.test(k)).map((k) => k.slice(3)).sort((a, b) => b.length - a.length);

/** Reason an answer was rejected, in the player's language. */
export const REASONS: Record<string, string> = new Proxy({}, {
  get(_t, code: string) {
    const k = `rs.${code}` as Key;
    return k in en ? t(k) : undefined;
  },
});

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err
    ? String((err as { message: unknown }).message) : String(err);
  const code = ERROR_CODES.find((k) => raw.includes(k));
  if (code) return t(`er.${code}` as Key);
  if (/fetch|network/i.test(raw)) return t('er.network');
  return t('er.generic');
}
