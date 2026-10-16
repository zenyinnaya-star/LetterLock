'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui';
import { mm, mmError, saveToken } from '@/lib/mastermind';
import { loadName, saveName } from '@/lib/session';
import { mmArtVars } from '@/lib/mmArt';
import './mastermind.css';

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
      <div className="mm-room simple" style={mmArtVars}>
        <div className="mm-center">
        <h1 className="mm-title">Mastermind</h1>
        <p className="mm-sub">One of you holds the secret word. Three clues. Everyone else races to crack it.</p>
        <div className="mm-folder" data-tab="Open a case">
          <input className="input" placeholder="Detective name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="mm-toggle"><input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> Quick case (3 short rounds)</label>
          <button className="btn lg" disabled={busy || !name.trim()} onClick={() => go(() => mm.create(name.trim(), quick))}>Open the case</button>
        </div>
        <div className="mm-or">or join an investigation</div>
        <div className="mm-folder" data-tab="Join">
          <div className="mm-row">
            <input className="input" placeholder="CODE" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="btn ghost" disabled={busy || !name.trim() || code.length < 4} onClick={() => go(() => mm.join(code, name.trim()))}>Join</button>
          </div>
        </div>
        {err && <p className="mm-err">{err}</p>}
        </div>
      </div>
    </main>
  );
}
