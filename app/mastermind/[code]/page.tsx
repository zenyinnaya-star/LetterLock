'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from '@/components/ui';
import { audio } from '@/lib/audio';
import { loadToken, mm, mmError, saveToken, type MmState } from '@/lib/mastermind';
import { loadName } from '@/lib/session';

const CIRC = 2 * Math.PI * 44;

function Clock({ secs, total }: { secs: number; total: number }) {
  const frac = Math.max(0, Math.min(1, total > 0 ? secs / total : 0));
  return (
    <div className="mm-clockwrap">
      <svg className={`mm-clock${secs <= 10 && secs > 0 ? ' urgent' : ''}`} viewBox="0 0 100 100" role="timer" aria-label={`${secs} seconds left`}>
        <circle className="face" cx="50" cy="50" r="46" />
        <circle className="arc" cx="50" cy="50" r="44" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} />
        <line className="hand" x1="50" y1="50" x2="50" y2="14" style={{ transform: `rotate(${360 * (1 - frac)}deg)` }} />
        <circle cx="50" cy="50" r="3.5" fill="#2a1d12" />
        <text x="50" y="72">{secs}</text>
      </svg>
    </div>
  );
}

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
  const [flash, setFlash] = useState<{ k: number; kind: 'good' | 'bad' } | null>(null);
  const [shake, setShake] = useState(0);
  const [hitId, setHitId] = useState<string | null>(null);
  const offset = useRef(0);
  const [joinName, setJoinName] = useState('');
  const prev = useRef({ clues: 0, guesses: 0, status: '', round: 0, tick: -1 });

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

  const secsLeft = s?.room.round_ends ? Math.max(0, Math.ceil((s.room.round_ends - now) / 1000)) : 0;

  // sound + flash reactions to what changed on the server
  useEffect(() => {
    if (!s) return;
    const p = prev.current;
    const { room, me } = s;
    if (room.round !== p.round) { p.round = room.round; p.clues = 0; p.guesses = 0; }
    if (s.clues.length > p.clues) { if (p.clues > 0 || room.status === 'round') audio.pin(); p.clues = s.clues.length; }
    if (s.guesses.length > p.guesses) {
      const fresh = s.guesses.slice(p.guesses).filter((g) => !g.correct && g.player_id !== me.id);
      if (fresh.length) { audio.denied(); setHitId(fresh[fresh.length - 1].player_id); window.setTimeout(() => setHitId(null), 500); }
      p.guesses = s.guesses.length;
    }
    if (room.status !== p.status) {
      if (room.status === 'between' && p.status === 'round') {
        if (room.solved_by) { audio.cracked(); setFlash({ k: Date.now(), kind: 'good' }); } else audio.cold();
      }
      p.status = room.status;
    }
  }, [s]);

  useEffect(() => {
    if (s?.room.status !== 'round' || secsLeft > 10 || secsLeft <= 0 || prev.current.tick === secsLeft) return;
    prev.current.tick = secsLeft;
    audio.clockTick(secsLeft > 5);
  }, [secsLeft, s?.room.status]);

  async function act(fn: () => Promise<unknown>) {
    audio.unlock();
    setBusy(true); setErr(null);
    try { await fn(); setText(''); await refresh(); } catch (e) { setErr(mmError(e)); }
    setBusy(false);
  }

  async function guess() {
    if (!token || !text.trim()) return;
    audio.unlock();
    setBusy(true); setErr(null);
    try {
      const r = await mm.guess(token, text);
      setText('');
      if (r.correct) { setFlash({ k: Date.now(), kind: 'good' }); } else { audio.slam(); setFlash({ k: Date.now(), kind: 'bad' }); setShake(Date.now()); }
      await refresh();
    } catch (e) { setErr(mmError(e)); }
    setBusy(false);
  }

  if (!ready) return null;
  if (!token) {
    return (
      <main className="shell narrow"><Header />
        <div className="mm-room">
          <h1 className="mm-title">Case {code}</h1>
          <div className="mm-folder" data-tab="Join">
            <input className="input" placeholder="Detective name" maxLength={20} value={joinName} onChange={(e) => setJoinName(e.target.value)} />
            <button className="btn lg" disabled={busy || !joinName.trim()} onClick={() => act(async () => {
              const r = await mm.join(code, joinName.trim()); saveToken(r.code, r.token); setToken(r.token);
            })}>Join the investigation</button>
          </div>
          {err && <p className="mm-err">{err}</p>}
        </div>
      </main>
    );
  }
  if (!s) return <main className="shell narrow"><Header /><div className="mm-room"><p className="mm-sub">{err ?? 'Setting up the room…'}</p></div></main>;

  const { room, me, players } = s;
  const mmName = players.find((p) => p.is_mastermind)?.name ?? '';
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const board = [...players].sort((a, b) => b.points - a.points);
  const inRound = room.status === 'round';
  const lineup = players.filter((p) => !p.out);
  const behindGlass = inRound ? players.filter((p) => p.out && !p.is_mastermind) : [];
  const cards = Array.from({ length: room.clue_limit }, (_, i) => s.clues[i] ?? null);

  return (
    <main className="shell narrow"><Header />
      <div className="mm-room">
        <AnimatePresence>
          {flash && <motion.div key={flash.k} className={`mm-flash ${flash.kind}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} onAnimationComplete={() => setFlash(null)} />}
        </AnimatePresence>
        {flash?.kind === 'good' && room.status !== 'lobby' && <div key={`c${flash.k}`} className="mm-cracked">CRACKED IT</div>}

        <div className="mm-top">
          <span>Case <span className="mm-code">{room.code}</span></span>
          {room.status !== 'lobby' && <span>Round {room.round}/{room.total_rounds}{room.quick ? ' · Quick' : ''}</span>}
        </div>

        {room.status === 'lobby' && (
          <>
            <h1 className="mm-title">Case {room.code}</h1>
            <p className="mm-sub">Share this code. {room.quick ? '3 short rounds.' : 'Everyone takes a turn holding the secret.'}</p>
            <div className="mm-lineup">
              {players.map((p) => (
                <div key={p.id} className={`mm-suspect${p.id === me.id ? ' me' : ''}`}>
                  <div className="mug">{p.name.slice(0, 1).toUpperCase()}</div>{p.name}{p.is_host ? ' ★' : ''}
                </div>
              ))}
            </div>
            {me.is_host
              ? <button className="btn lg" disabled={busy || players.length < 2} onClick={() => act(() => mm.start(token))}>{players.length < 2 ? 'Waiting for suspects…' : 'Begin the interrogation'}</button>
              : <p className="mm-sub">Waiting for the host to begin…</p>}
          </>
        )}

        {inRound && (
          <>
            <Clock secs={secsLeft} total={room.round_secs} />
            <div className="mm-table">
              <div className="mm-kicker">{me.is_mastermind ? 'You hold the secret' : `${mmName} holds the secret`}</div>
              {me.is_mastermind ? <div className="mm-word">{s.word}</div> : <div className="mm-word hidden">? ? ?</div>}
            </div>

            <div className="mm-cork">
              <div className="mm-cards">
                <AnimatePresence initial={false}>
                  {cards.map((c, i) => c
                    ? <motion.div key={`${room.round}-${i}`} className="mm-card" initial={{ y: -60, opacity: 0, scale: 1.25 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
                        <span className="num">CLUE {i + 1}</span>{c}
                      </motion.div>
                    : <div key={`e${room.round}-${i}`} className="mm-card empty"><span className="num">CLUE {i + 1}</span>…</div>)}
                </AnimatePresence>
              </div>
            </div>
            <div className="mm-left">{room.clues_left} clue{room.clues_left === 1 ? '' : 's'} left · fewer clues = more points</div>

            {me.is_mastermind && room.clues_left > 0 && (
              <form className="mm-folder" data-tab="Write a clue" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void act(() => mm.clue(token, text)); }}>
                <div className="mm-row">
                  <input className="input" placeholder="Hint without saying the word" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn" disabled={busy}>Pin it</button>
                </div>
              </form>
            )}

            {!me.is_mastermind && !me.out && (
              <form key={shake} className={`mm-folder${shake ? ' shake' : ''}`} data-tab="Case file · your guess" onSubmit={(e) => { e.preventDefault(); void guess(); }}>
                <div className="mm-row">
                  <input className="input" placeholder="Name the word" maxLength={20} value={text} autoCapitalize="off" autoComplete="off" onChange={(e) => setText(e.target.value)} />
                  <button className="btn" disabled={busy}>Accuse</button>
                </div>
              </form>
            )}

            <div className="mm-lineup" aria-label="Suspect lineup">
              {lineup.map((p) => (
                <div key={p.id} className={`mm-suspect${p.id === me.id ? ' me' : ''}${p.is_mastermind ? ' mm' : ''}${hitId === p.id ? ' hit' : ''}`}>
                  <div className="mug">{p.is_mastermind ? '💡' : p.name.slice(0, 1).toUpperCase()}</div>
                  {p.name}
                  <div className="hp">{p.is_mastermind ? 'Mastermind' : '❤'.repeat(Math.max(0, p.hp))}</div>
                </div>
              ))}
            </div>

            {(behindGlass.length > 0 || (me.out && !me.is_mastermind)) && (
              <div className="mm-glass">
                <div className="tag">Behind the glass</div>
                <div className="sil">
                  {behindGlass.map((p) => <div key={p.id} className="ghost"><div className="mug">{p.name.slice(0, 1).toUpperCase()}</div>{p.name}</div>)}
                </div>
                {me.out && !me.is_mastermind && (
                  <>
                    <p className="mm-sub">You&apos;re out. Back a suspect: if they crack it, you earn 3 points.</p>
                    <div className="mm-row wrap" style={{ justifyContent: 'center' }}>
                      {lineup.filter((p) => !p.is_mastermind).map((p) => (
                        <button key={p.id} className={`btn sm ${me.backing === p.id ? '' : 'ghost'}`} disabled={busy} onClick={() => act(() => mm.back(token, p.id))}>{p.name}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {s.guesses.length > 0 && (
              <ul className="mm-notes">{s.guesses.map((g, i) => <li key={i} className={g.correct ? '' : 'x'}>{nameOf(g.player_id)}: {g.text}</li>)}</ul>
            )}
          </>
        )}

        {room.status === 'between' && (
          <>
            <div className={`mm-verdict ${room.solved_by ? 'good' : 'bad'}`}>{room.solved_by ? `${nameOf(room.solved_by)} cracked it` : 'The case went cold'}</div>
            <div className="mm-table"><div className="mm-kicker">The word was</div><div className="mm-word">{s.word}</div></div>
            <p className="mm-sub">Next round starting…</p>
          </>
        )}

        {room.status === 'finished' && (
          <>
            <div className="mm-verdict good">Case closed</div>
            {s.word && <p className="mm-sub">Last word: {s.word}</p>}
            {me.is_host && <button className="btn lg" disabled={busy} onClick={() => act(() => mm.again(token))}>New case</button>}
          </>
        )}

        {room.status !== 'lobby' && (
          <ol className="mm-board">{board.map((p) => <li key={p.id}><span>{p.name}{p.id === me.id ? ' (you)' : ''}</span><b>{p.points}</b></li>)}</ol>
        )}
        {err && <p className="mm-err">{err}</p>}
        <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => router.push('/play')}>Leave</button>
      </div>
    </main>
  );
}
