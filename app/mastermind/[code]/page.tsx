'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui';
import { loadToken, mm, mmError, saveToken, type MmState } from '@/lib/mastermind';
import { loadName } from '@/lib/session';

export default function MastermindRoom({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = use(params);
  const code = raw.toUpperCase();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [s, setS] = useState<MmState | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const [joinName, setJoinName] = useState('');

  useEffect(() => { setToken(loadToken(code)); setJoinName(loadName()); setReady(true); }, [code]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const st = await mm.state(token);
      offset.current = st.room.server_now - Date.now();
      setS(st);
    } catch (e) { setErr(mmError(e)); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refresh();
    const id = window.setInterval(refresh, 1200);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => window.clearInterval(id);
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); setText(''); await refresh(); } catch (e) { setErr(mmError(e)); }
    setBusy(false);
  }

  if (!ready) return null;
  if (!token) {
    return (
      <main className="shell narrow"><Header />
        <div className="sheet mm-page">
          <h1 className="mm-title">Join room {code}</h1>
          <input className="input" placeholder="Your name" maxLength={20} value={joinName} onChange={(e) => setJoinName(e.target.value)} />
          <button className="btn lg" disabled={busy || !joinName.trim()} onClick={() => act(async () => {
            const r = await mm.join(code, joinName.trim()); saveToken(r.code, r.token); setToken(r.token);
          })}>Join</button>
          {err && <p className="mm-err">{err}</p>}
        </div>
      </main>
    );
  }
  if (!s) return <main className="shell narrow"><Header /><div className="sheet mm-page"><p className="muted">{err ?? 'Loading…'}</p></div></main>;

  const { room, me, players } = s;
  const secsLeft = room.round_ends ? Math.max(0, Math.ceil((room.round_ends - now) / 1000)) : 0;
  const mmName = players.find((p) => p.is_mastermind)?.name ?? '';
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const board = [...players].sort((a, b) => b.points - a.points);

  return (
    <main className="shell narrow"><Header />
      <div className="sheet mm-page">
        <div className="mm-top">
          <b>Room {room.code}</b>
          {room.status !== 'lobby' && <span className="muted small">Round {room.round}/{room.total_rounds}{room.quick ? ' · Quick' : ''}</span>}
        </div>

        {room.status === 'lobby' && (<>
          <p className="muted">Share the code <b>{room.code}</b> or this page link. {room.quick ? 'Quick Match: 3 short rounds.' : 'One round per player.'}</p>
          <ul className="mm-list">{players.map((p) => <li key={p.id}>{p.name}{p.is_host ? ' 👑' : ''}</li>)}</ul>
          {me.is_host
            ? <button className="btn lg" disabled={busy || players.length < 2} onClick={() => act(() => mm.start(token))}>{players.length < 2 ? 'Waiting for players…' : 'Start'}</button>
            : <p className="muted">Waiting for the host to start…</p>}
        </>)}

        {room.status === 'round' && (<>
          <div className="mm-clock">{secsLeft}s</div>
          {me.is_mastermind ? (<>
            <div className="mm-word">Your word: <b>{s.word}</b></div>
            <p className="muted">You're the Mastermind. Give clues without saying the word. Clues left: {room.clues_left}</p>
          </>) : (
            <p className="muted"><b>{mmName}</b> is the Mastermind. Clues left: {room.clues_left}</p>
          )}
          <ol className="mm-clues">{s.clues.map((c, i) => <li key={i}>{c}</li>)}{s.clues.length === 0 && <li className="muted">No clues yet…</li>}</ol>

          {me.is_mastermind && room.clues_left > 0 && (
            <form className="mm-row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void act(() => mm.clue(token, text)); }}>
              <input className="input" placeholder="Type a clue" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn" disabled={busy}>Send</button>
            </form>
          )}

          {!me.is_mastermind && !me.out && (<>
            <div className="mm-hp">{'❤'.repeat(Math.max(0, me.hp))}{'·'.repeat(Math.max(0, 3 - me.hp))}</div>
            <form className="mm-row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void act(() => mm.guess(token, text)); }}>
              <input className="input" placeholder="Your guess" maxLength={20} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="off" />
              <button className="btn" disabled={busy}>Guess</button>
            </form>
          </>)}

          {me.out && !me.is_mastermind && (
            <div className="mm-out">
              <p className="muted">You're out. Back a player: if they solve it, you earn 3 points.</p>
              <div className="mm-row wrap">
                {players.filter((p) => !p.is_mastermind && !p.out).map((p) => (
                  <button key={p.id} className={`btn sm ${me.backing === p.id ? '' : 'ghost'}`} disabled={busy} onClick={() => act(() => mm.back(token, p.id))}>{p.name}</button>
                ))}
              </div>
            </div>
          )}

          <ul className="mm-guesses">{s.guesses.map((g, i) => <li key={i}><b>{nameOf(g.player_id)}</b>: {g.text}</li>)}</ul>
        </>)}

        {room.status === 'between' && (<>
          <h2>{room.solved_by ? `${nameOf(room.solved_by)} got it!` : 'Nobody got it.'}</h2>
          <div className="mm-word">The word was <b>{s.word}</b></div>
          <p className="muted">Next round starting…</p>
        </>)}

        {room.status === 'finished' && (<>
          <h2>Game over</h2>
          {s.word && <p className="muted">Last word: {s.word}</p>}
          {me.is_host && <button className="btn lg" disabled={busy} onClick={() => act(() => mm.again(token))}>Play again</button>}
        </>)}

        {room.status !== 'lobby' && (
          <ol className="mm-board">{board.map((p) => <li key={p.id}><span>{p.name}{p.is_mastermind && room.status === 'round' ? ' 💡' : ''}{p.out && room.status === 'round' ? ' ✖' : ''}</span><b>{p.points}</b></li>)}</ol>
        )}
        {err && <p className="mm-err">{err}</p>}
        <button className="btn ghost sm" onClick={() => router.push('/play')}>Leave</button>
      </div>
    </main>
  );
}
