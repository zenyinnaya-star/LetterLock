// Player avatars: an uploaded photo (resized in the browser, stored in the public "avatars" bucket) or a generated placeholder.
import { supabase } from './supabase';

const KEY = 'letterlock:avatar';

export function loadAvatar(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
export function saveAvatar(url: string | null) {
  try { if (url) window.localStorage.setItem(KEY, url); else window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Center-crops to a square, scales to 256px, encodes JPEG, uploads, returns the public URL. */
export async function uploadAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image.'))), 'image/jpeg', 0.85));
  const name = `${uuid()}.jpg`;
  const sb = supabase();
  const { error } = await sb.storage.from('avatars').upload(name, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return sb.storage.from('avatars').getPublicUrl(name).data.publicUrl;
}

/** Deterministic colour pair for a name. */
export function avatarColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return [`hsl(${hue} 80% 62%)`, `hsl(${(hue + 40) % 360} 70% 38%)`];
}
