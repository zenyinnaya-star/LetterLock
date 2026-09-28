import type { Session } from './types';

const key = (code: string) => `letterlock:${code.toUpperCase()}`;

export function loadSession(code: string): Session | null {
  try {
    const raw = window.localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, s: Session): void {
  try { window.localStorage.setItem(key(code), JSON.stringify(s)); } catch { /* private mode */ }
}

export function clearSession(code: string): void {
  try { window.localStorage.removeItem(key(code)); } catch { /* ignore */ }
}

export function loadName(): string {
  try { return window.localStorage.getItem('letterlock:name') ?? ''; } catch { return ''; }
}

export function saveName(name: string): void {
  try { window.localStorage.setItem('letterlock:name', name); } catch { /* ignore */ }
}
