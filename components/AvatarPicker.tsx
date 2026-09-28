'use client';

import { useRef, useState } from 'react';
import { uploadAvatar } from '@/lib/avatar';
import { Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';

/** Your face in the game: the default placeholder, or a photo you upload (cropped square, 256px). */
export function AvatarPicker({ name, url, onChange, compact = false }: {
  name: string; url: string | null; onChange: (url: string | null) => void; compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setErr(null);
    try { onChange(await uploadAvatar(file)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <div className={`avatar-picker${compact ? ' compact' : ''}`}>
      <PlayerAvatar p={{ name: name || '?', avatar_url: url }} size={compact ? 44 : 64} />
      <div className="col" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="users" size={14} /> {busy ? 'Uploading…' : url ? 'Change photo' : 'Upload photo'}
          </button>
          {url && <button type="button" className="btn sm ghost" disabled={busy} onClick={() => onChange(null)}>Use default</button>}
        </div>
        {!compact && <span className="muted small">{url ? 'Your photo shows instead of your class.' : 'Default avatar — your class stays secret.'}</span>}
        {err && <span className="small" style={{ color: '#ff9aae' }}>{err}</span>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
