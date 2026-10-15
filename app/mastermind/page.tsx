'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui';
import { mm, mmError, saveToken } from '@/lib/mastermind';
import { loadName, saveName } from '@/lib/session';

export default function MastermindHome() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [quick, setQuick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setName(loadName()); }, []);

  async function go(fn: () => Promise<{ code: string; token: string }>) {
    setBusy(true); setErr(null);
    try { saveName(name.trim()); const r = await fn(); saveToken(r.code, r.token); router.push(`/mastermind/${r.code}`); }
    catch (e) { setErr(mmError(e)); setBusy(false); }
  }

  return (
    <main className="shell narrow">
      <Header />
      <div className="sheet mm-page">
        <h1 className="mm-title">Mastermind</h1>
        <p className="muted">One player secretly holds a word and gives up to 3 clues. Everyone else races to guess it. Wrong guesses cost HP.</p>
        <input className="input" placeholder="Your name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="mm-toggle"><input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> Quick Match (3 short rounds)</label>
        <button className="btn lg" disabled={busy || !name.trim()} onClick={() => go(() => mm.create(name.trim(), quick))}>Create room</button>
        <div className="mm-or">or join a friend</div>
        <div className="mm-row">
          <input className="input" placeholder="CODE" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn ghost" disabled={busy || !name.trim() || code.length < 4} onClick={() => go(() => mm.join(code, name.trim()))}>Join</button>
        </div>
        {err && <p className="mm-err">{err}</p>}
      </div>
    </main>
  );
}
