'use client';

import { ComingSoon } from '@/components/ComingSoon';
import { CLASSIC_ONLY } from '@/lib/modes';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui';
import { mm, mmError, saveToken } from '@/lib/mastermind';
import { loadName, saveName } from '@/lib/session';
import { mmArtVars } from '@/lib/mmArt';
import { westArtVars } from '@/lib/westArt';
import { comicKitVars } from '@/lib/comicKit';
import './mastermind.css';
import './mm-comic.css';

function MastermindHomeInner() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [quick, setQuick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setName(loadName()); if (new URLSearchParams(window.location.search).get('removed')) setErr('You were removed from that case.'); }, []);

  async function go(fn: () => Promise<{ code: string; token: string }>) {
    setBusy(true); setErr(null);
    try { saveName(name.trim()); const r = await fn(); saveToken(r.code, r.token); router.push(`/mastermind/${r.code}`); }
    catch (e) { setErr(mmError(e)); setBusy(false); }
  }

  return (
    <main className="shell narrow">
      <Header />
      <div className="mm-room simple" style={{ ...mmArtVars, ...westArtVars, ...comicKitVars }}>
        <div className="mm-center">
        <h1 className="mm-title">Mastermind</h1>
        <div className="mm-start">
          <ul className="mm-rules">
            <li><b>Mastermind</b> hides a word and drops clues.</li>
            <li><b>Detectives</b> crack it before time runs out.</li>
            <li><b>1 Impostor</b> fakes guesses. Vote them out.</li>
          </ul>
          <p className="mm-need">4+ players</p>
          <label className="mm-field">
            <span>Your name</span>
            <input className="input" placeholder="Detective name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </label>
          <label className="mm-toggle"><input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> Quick case (3 short rounds)</label>
          <button className="mm-go" disabled={busy || !name.trim()} onClick={() => go(() => mm.create(name.trim(), quick))}>Open a new case</button>
          <div className="mm-div"><span>or join with a code</span></div>
          <div className="mm-row">
            <input className="input" placeholder="CODE" aria-label="Room code" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy && name.trim() && code.length >= 4) go(() => mm.join(code, name.trim())); }} />
            <button className="mm-go alt" disabled={busy || !name.trim() || code.length < 4} onClick={() => go(() => mm.join(code, name.trim()))}>Join</button>
          </div>
          {!name.trim() && <p className="mm-hint">Type your name first.</p>}
        </div>
        {err && <p className="mm-err">{err}</p>}
        </div>
      </div>
    </main>
  );
}

export default function MastermindHome() { return CLASSIC_ONLY ? <ComingSoon name="Mastermind" /> : <MastermindHomeInner />; }
