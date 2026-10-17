'use client';

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from '@/components/ui';
import { audio } from '@/lib/audio';
import { loadToken, mm, mmError, REACTIONS, saveToken, type MmState } from '@/lib/mastermind';
import { mmArtVars } from '@/lib/mmArt';
import { loadName } from '@/lib/session';
import '../mastermind.css';

const CIRC = 2 * Math.PI * 44;

function Clock({ secs, total }: { secs: number; total: number }) {
  const frac = Math.max(0, Math.min(1, total > 0 ? secs / total : 0));
  return (
    <div className="mm-clockwrap">
      <svg className={`mm-clock${secs <= 10 && secs > 0 ? ' urgent' : ''}`} viewBox="0 0 100 100" role="timer" aria-label={`${secs} seconds left`}>
        <circle className="face" cx="50" cy="50" r="46" />
        {Array.from({ length: 12 }, (_, i) => <line key={i} className="tick" x1="50" y1="9" x2="50" y2={i % 3 ? 13 : 16} style={{ transform: `rotate(${i * 30}deg)` }} />)}
        <circle className="arc" cx="50" cy="50" r="44" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} />
        <line className="hand" x1="50" y1="50" x2="50" y2="17" style={{ transform: `rotate(${360 * (1 - frac)}deg)` }} />
        <circle cx="50" cy="50" r="3.5" fill="#2a1d12" />
        <text x="50" y="74">{secs}</text>
      </svg>
    </div>
  );
}

/** Index card whose text types out like a typewriter the first time it appears. */
function ClueCard({ text, n, fresh }: { text: string; n: number; fresh: boolean }) {
  const [shown, setShown] = useState(fresh ? 0 : text.length);
  useEffect(() => {
    if (shown >= text.length) return;
    const id = window.setTimeout(() => { setShown((v) => v + 1); if (shown % 2 === 0) audio.key(); }, 28);
    return () => window.clearTimeout(id);
  }, [shown, text.length]);
  const isReveal = /^Letter \d+ is [A-Z]$/.test(text);
  return (
    <motion.div data-pin className={`mm-card${isReveal ? ' reveal' : ''}`}
      initial={fresh ? { y: -70, opacity: 0, scale: 1.3, rotate: -8 } : false} animate={{ y: 0, opacity: 1, scale: 1, rotate: n % 2 ? 1.8 : -2.2 }}
      transition={{ type: 'spring', stiffness: 420, damping: 17 }}>
      <span className="num">{isReveal ? 'EVIDENCE' : `CLUE ${n + 1}`}</span>
      <span className="txt">{text.slice(0, shown)}{shown < text.length && <i className="caret" />}</span>
    </motion.div>
  );
}

type Float = { id: number; emoji: string; x: number; name: string };

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
  const [flicker, setFlicker] = useState(0);
  const [hitId, setHitId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ k: number; msg: string } | null>(null);
  const [stamp, setStamp] = useState<{ k: number; kind: 'good' | 'bad' } | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [freshClue, setFreshClue] = useState(-1);
  const [glowSlot, setGlowSlot] = useState<number[]>([]);
  const offset = useRef(0);
  const [joinName, setJoinName] = useState('');
  const prev = useRef({ clues: 0, guesses: 0, status: '', round: 0, tick: -1, react: 0, slots: '' as string, points: {} as Record<string, number> });

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
    const id = window.setInterval(refresh, 1100);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => window.clearInterval(id);
  }, []);

  const secsLeft = s?.room.round_ends ? Math.max(0, Math.ceil((s.room.round_ends - now) / 1000)) : 0;
  const tense = s?.room.status === 'round' && secsLeft > 0 && secsLeft <= 10;

  // react to what changed on the server
  useEffect(() => {
    if (!s) return;
    const p = prev.current;
    const { room, me } = s;
    if (!p.status) {
      // first poll after (re)loading: sync silently so old clues/guesses/reactions don't replay
      Object.assign(p, { round: room.round, clues: s.clues.length, guesses: s.guesses.length, status: room.status,
        slots: (s.slots ?? []).map((x) => x ?? '_').join(''), react: Math.max(0, ...(s.reacts ?? []).map((r) => r.id)),
        points: Object.fromEntries(s.players.map((x) => [x.id, x.points])) });
      return;
    }
    if (room.round !== p.round) {
      p.round = room.round; p.clues = 0; p.guesses = 0; p.slots = '';
      p.points = Object.fromEntries(s.players.map((x) => [x.id, x.points]));
      setDeltas({});
    }
    if (s.clues.length > p.clues) {
      if (room.status === 'round') { audio.pin(); setFreshClue(s.clues.length - 1); }
      p.clues = s.clues.length;
    }
    if (s.guesses.length > p.guesses) {
      const fresh = s.guesses.slice(p.guesses).filter((g) => !g.correct);
      if (fresh.length) {
        setFlicker(Date.now()); audio.flicker();
        const others = fresh.filter((g) => g.player_id !== me.id);
        if (others.length) { audio.denied(); setHitId(others[others.length - 1].player_id); window.setTimeout(() => setHitId(null), 500); }
      }
      p.guesses = s.guesses.length;
    }
    const slotKey = (s.slots ?? []).map((x) => x ?? '_').join('');
    if (p.slots && slotKey !== p.slots && room.status === 'round') {
      const lit = slotKey.split('').map((c, i) => (c !== '_' && p.slots[i] === '_' ? i : -1)).filter((i) => i >= 0);
      if (lit.length) { audio.reveal(); setGlowSlot(lit); window.setTimeout(() => setGlowSlot([]), 1600); }
    }
    p.slots = slotKey;
    for (const r of s.reacts ?? []) {
      if (r.id <= p.react) continue;
      p.react = r.id;
      const name = s.players.find((x) => x.id === r.player_id)?.name ?? '';
      const f = { id: r.id, emoji: r.emoji, name, x: 8 + Math.random() * 84 };
      setFloats((v) => [...v.slice(-14), f]);
      if (r.player_id !== me.id) audio.pop();
      window.setTimeout(() => setFloats((v) => v.filter((x) => x.id !== f.id)), 2800);
    }
    if (room.status !== p.status) {
      if (room.status === 'between' && p.status === 'round') {
        const good = !!room.solved_by;
        if (good) { audio.cracked(); setFlash({ k: Date.now(), kind: 'good' }); } else audio.cold();
        window.setTimeout(() => { setStamp({ k: Date.now(), kind: good ? 'good' : 'bad' }); audio.stamp(); setShake(Date.now()); }, 350);
        setDeltas(Object.fromEntries(s.players.map((x) => [x.id, x.points - (p.points[x.id] ?? x.points)])));
      }
      if (room.status === 'round') setStamp(null);
      p.status = room.status;
    }
  }, [s]);

  // last ten seconds: heartbeat + tick
  useEffect(() => {
    if (!tense || prev.current.tick === secsLeft) return;
    prev.current.tick = secsLeft;
    audio.heartbeat();
    audio.clockTick(secsLeft > 5);
  }, [secsLeft, tense]);

  // red string between pinned items, measured from the real card positions
  const corkRef = useRef<HTMLDivElement>(null);
  const [pins, setPins] = useState<{ x: number; y: number }[]>([]);
  const [corkSize, setCorkSize] = useState({ w: 1, h: 1 });
  const measure = useCallback(() => {
    const cork = corkRef.current;
    if (!cork) return;
    const box = cork.getBoundingClientRect();
    setCorkSize({ w: box.width, h: box.height });
    setPins([...cork.querySelectorAll<HTMLElement>('[data-pin]')].filter((el) => el.offsetWidth > 0).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + 4 };
    }));
  }, []);
  const clueCount = s?.clues.length ?? 0;
  useLayoutEffect(() => { const id = window.setTimeout(measure, 450); return () => window.clearTimeout(id); }, [measure, clueCount, s?.room.status, s?.room.round]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (corkRef.current) ro.observe(corkRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, s?.room.status]);

  async function act(fn: () => Promise<unknown>, keepText = false) {
    audio.unlock();
    setBusy(true); setErr(null);
    try { await fn(); if (!keepText) setText(''); await refresh(); } catch (e) { setErr(mmError(e)); }
    setBusy(false);
  }

  async function guess() {
    if (!token || !text.trim()) return;
    audio.unlock();
    setBusy(true); setErr(null);
    const typed = text.trim().toLowerCase().replace(/[^a-z]/g, '');
    try {
      const r = await mm.guess(token, text);
      setText('');
      if (r.correct) { setFlash({ k: Date.now(), kind: 'good' }); }
      else { audio.slam(); setFlash({ k: Date.now(), kind: 'bad' }); setShake(Date.now()); }
      const st = await mm.state(token);
      offset.current = st.room.server_now - Date.now();
      setS(st);
      if (!r.correct) {
        const mine = [...st.guesses].reverse().find((g) => g.player_id === st.me.id && g.text === typed);
        const hits = mine?.hits;
        setToast({ k: Date.now(), msg: hits === undefined ? `${typed.toUpperCase()} is wrong` : `${typed.toUpperCase()}: ${hits} letter${hits === 1 ? '' : 's'} in the right place` });
      }
    } catch (e) { setErr(mmError(e)); }
    setBusy(false);
  }

  function react(e: string) {
    if (!token) return;
    audio.unlock(); audio.pop();
    mm.react(token, e).then(refresh).catch(() => {
      // older server without reactions: still show it locally
      const f = { id: -Date.now(), emoji: e, name: s?.me.name ?? '', x: 8 + Math.random() * 84 };
      setFloats((v) => [...v.slice(-14), f]);
      window.setTimeout(() => setFloats((v) => v.filter((x) => x.id !== f.id)), 2800);
    });
  }

  if (!ready) return null;
  if (!token) {
    return (
      <main className="shell narrow"><Header />
        <div className="mm-room simple" style={mmArtVars}>
          <div className="mm-center">
            <h1 className="mm-title">Case {code}</h1>
            <div className="mm-folder" data-tab="Join">
              <input className="input" placeholder="Detective name" maxLength={20} value={joinName} onChange={(e) => setJoinName(e.target.value)} />
              <button className="btn lg" disabled={busy || !joinName.trim()} onClick={() => act(async () => {
                const r = await mm.join(code, joinName.trim()); saveToken(r.code, r.token); setToken(r.token);
              })}>Join the investigation</button>
            </div>
            {err && <p className="mm-err">{err}</p>}
          </div>
        </div>
      </main>
    );
  }
  if (!s) return <main className="shell narrow"><Header /><div className="mm-room simple" style={mmArtVars}><div className="mm-center"><p className="mm-sub">{err ?? 'Setting up the room…'}</p></div></div></main>;

  const { room, me, players } = s;
  const mmPlayer = players.find((p) => p.is_mastermind);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const board = [...players].sort((a, b) => b.points - a.points);
  const inRound = room.status === 'round';
  const lineup = players.filter((p) => !p.out);
  const behindGlass = inRound ? players.filter((p) => p.out && !p.is_mastermind) : [];
  const cards = Array.from({ length: room.clue_limit }, (_, i) => s.clues[i] ?? null);
  const guessing = inRound && !me.is_mastermind && !me.out;

  // letter slots on the table
  const known = s.slots && s.slots.length ? s.slots : (s.word ? s.word.toUpperCase().split('') : null);
  const typed = guessing ? text.toUpperCase().replace(/[^A-Z]/g, '') : '';
  const slots = known ?? Array.from({ length: 6 }, () => null as string | null);
  const unknownLen = !known;

  const strings = pins.slice(1).map((b, i) => {
    const a = pins[i];
    const sag = Math.min(46, 18 + Math.abs(b.x - a.x) * 0.12);
    return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + sag} ${b.x} ${b.y}`;
  });

  return (
    <main className="shell narrow"><Header />
      <div className={`mm-room stage s-${room.status}${tense ? ' tense' : ''}`} style={mmArtVars}>
        <div className="mm-light" key={flicker} data-flicker={flicker ? '1' : undefined} aria-hidden />
        <div className="mm-dust" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
        <div className="mm-vignette" aria-hidden />

        <AnimatePresence>
          {flash && <motion.div key={flash.k} className={`mm-flash ${flash.kind}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} onAnimationComplete={() => setFlash(null)} />}
        </AnimatePresence>

        <div className="mm-floats" aria-hidden>
          <AnimatePresence>
            {floats.map((f) => (
              <motion.div key={f.id} className="mm-float" style={{ left: `${f.x}%` }} initial={{ y: 0, opacity: 0, scale: 0.4 }}
                animate={{ y: -320, opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1, 1], rotate: (f.x % 20) - 10 }} transition={{ duration: 2.6, ease: 'easeOut' }}>
                {f.emoji}<span>{f.name}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ---------- HUD ---------- */}
        <div className="mm-hud">
          <div className="mm-casetag"><span>Case</span><b>{room.code}</b>{room.status !== 'lobby' && <em>Round {room.round}/{room.total_rounds}{room.quick ? ' · Quick' : ''}</em>}</div>
          {inRound && <Clock secs={secsLeft} total={room.round_secs} />}
        </div>

        {/* ---------- WALL (cork board) ---------- */}
        <div className="mm-wall">
          <div ref={corkRef} className={`mm-cork${stamp ? ' jolt' : ''}`}>
            <svg className="mm-strings" width={corkSize.w} height={corkSize.h} aria-hidden>
              {strings.map((d, i) => <motion.path key={`${room.round}-${i}-${d.length > 0}`} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.15 }} />)}
            </svg>

            {room.status === 'lobby' && (
              <>
                <div className="mm-cork-title">Case {room.code}<small>{room.quick ? 'Quick case · 3 short rounds' : 'Everyone takes a turn holding the secret'}</small></div>
                <div className="mm-mugs">
                  {players.map((p) => (
                    <motion.div key={p.id} data-pin className={`mm-photo${p.id === me.id ? ' me' : ''}`} initial={{ y: -40, opacity: 0, rotate: -6 }} animate={{ y: 0, opacity: 1, rotate: (p.name.length % 5) - 2 }}>
                      <div className="pic sil" /><div className="cap">{p.name}{p.is_host ? ' ★' : ''}</div>
                    </motion.div>
                  ))}
                  {Array.from({ length: Math.max(0, 2 - players.length) }, (_, i) => <div key={`w${i}`} className="mm-photo empty"><div className="pic">?</div><div className="cap">Waiting…</div></div>)}
                </div>
              </>
            )}

            {(inRound || room.status === 'between') && (
              <div className="mm-evidence">
                <div data-pin className="mm-photo suspect">
                  <div className="pic polaroid" /><div className="cap">{me.is_mastermind ? 'You' : mmPlayer?.name ?? '?'}<small>holds the secret</small></div>
                </div>
                <div className="mm-cards">
                  {cards.map((c, i) => c
                    ? <ClueCard key={`${room.round}-${i}`} text={c} n={i} fresh={i === freshClue} />
                    : <div key={`e${room.round}-${i}`} className="mm-card empty"><span className="num">CLUE {i + 1}</span><span className="txt">{me.is_mastermind ? 'Write a clue below' : 'Waiting for a clue…'}</span></div>)}
                </div>
                <div className="mm-log">
                  <div className="hd">Interrogation log</div>
                  {s.guesses.length === 0 && <div className="none">No accusations yet</div>}
                  <ul>
                    {s.guesses.slice(-7).map((g, i) => (
                      <li key={i} className={g.correct ? 'ok' : 'x'}>
                        <b>{nameOf(g.player_id)}</b> <span className="w">{g.text}</span>
                        {!g.correct && g.hits !== undefined && (
                          <span className="pegs" title={`${g.hits} in the right place`}>{Array.from({ length: Math.max(g.text.length, 1) }, (_, k) => <i key={k} className={k < g.hits! ? 'on' : ''} />)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {room.status === 'finished' && (
              <div className="mm-podium">
                {[board[1], board[0], board[2]].map((p, i) => p && (
                  <motion.div key={p.id} className={`step p${[2, 1, 3][i]}`} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: [0.35, 0.1, 0.6][i], type: 'spring', stiffness: 200, damping: 16 }}>
                    <div className="mm-photo"><div className="pic sil" /><div className="cap">{p.name}</div></div>
                    <div className="block"><span>{['2nd', '1st', '3rd'][i]}</span><b>{p.points}</b></div>
                  </motion.div>
                ))}
              </div>
            )}

            <AnimatePresence>
              {stamp && room.status !== 'round' && (
                <motion.div key={stamp.k} className={`mm-stamp ${stamp.kind}`} initial={{ scale: 3.2, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
                  {stamp.kind === 'good' ? 'Cracked' : 'Cold case'}
                </motion.div>
              )}
              {room.status === 'finished' && (
                <motion.div key="closed" className="mm-stamp good closed" initial={{ scale: 3, opacity: 0, rotate: 18 }} animate={{ scale: 1, opacity: 1, rotate: 8 }} transition={{ delay: 0.9, type: 'spring', stiffness: 500, damping: 22 }} onAnimationStart={() => window.setTimeout(() => audio.stamp(), 900)}>
                  Case closed
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ---------- TABLE (letter slots) ---------- */}
        <div className="mm-tabletop">
          {room.status === 'lobby' ? (
            <div className="mm-kicker">{players.length < 2 ? 'Share the code. You need at least 2 detectives.' : `${players.length} detectives in the room`}</div>
          ) : room.status === 'finished' ? (
            <div className="mm-kicker">{board[0] ? `${board[0].name} solves the most cases` : ''}{s.word ? ` · last word: ${s.word.toUpperCase()}` : ''}</div>
          ) : (
            <>
              <div className="mm-kicker">
                {room.status === 'between'
                  ? (room.solved_by ? `${nameOf(room.solved_by)} cracked it` : 'Nobody cracked it. The word was')
                  : me.is_mastermind ? 'Your secret word · only you can see it' : `${mmPlayer?.name ?? ''} is hiding a ${unknownLen ? '' : `${slots.length}-letter `}word`}
              </div>
              <div key={`slots${room.round}`} className={`mm-slots${room.status === 'between' ? ' reveal-all' : ''}${me.is_mastermind && inRound ? ' mine' : ''}`}>
                {slots.map((ch, i) => {
                  const t = typed[i];
                  const show = ch ?? t ?? '';
                  const cls = ch ? (glowSlot.includes(i) ? 'lit glow' : 'lit') : t ? 'typed' : unknownLen ? 'unknown' : '';
                  const clash = ch && t && t !== ch;
                  return (
                    <motion.div key={i} className={`slot ${cls}${clash ? ' clash' : ''}`}
                      initial={room.status === 'between' ? { rotateX: 90 } : false} animate={{ rotateX: 0 }} transition={{ delay: i * 0.08 }}>
                      {unknownLen && !ch && !t ? '?' : show}
                    </motion.div>
                  );
                })}
              </div>
              <AnimatePresence>
                {toast && <motion.div key={toast.k} className="mm-toast" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} onAnimationComplete={() => window.setTimeout(() => setToast((t) => (t?.k === toast.k ? null : t)), 2200)}>{toast.msg}</motion.div>}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* ---------- DOCK (case file) ---------- */}
        <div className="mm-dock">
          {room.status === 'lobby' && (
            me.is_host
              ? <button className="btn lg mm-cta" disabled={busy || players.length < 2} onClick={() => act(() => mm.start(token))}>{players.length < 2 ? 'Waiting for suspects…' : 'Begin the interrogation'}</button>
              : <p className="mm-sub">Waiting for the host to begin…</p>
          )}

          {inRound && me.is_mastermind && (
            <form className="mm-folder" data-tab={room.clues_left > 0 ? `Write a clue · ${room.clues_left} left` : 'No clues left'} onSubmit={(e) => { e.preventDefault(); if (text.trim()) void act(() => mm.clue(token, text)); }}>
              <div className="mm-row">
                <input className="input" placeholder={room.clues_left > 0 ? 'Hint without saying the word' : 'Out of clues. Sit tight.'} maxLength={80} value={text} disabled={room.clues_left <= 0} onChange={(e) => setText(e.target.value)} />
                <button className="btn" disabled={busy || room.clues_left <= 0}>Pin it</button>
              </div>
              {room.can_reveal !== undefined && (
                <button type="button" className="mm-reveal" disabled={busy || room.clues_left <= 0 || !room.can_reveal} onClick={() => act(() => mm.reveal(token), true)}>
                  🔎 Reveal a letter instead <small>(costs 1 clue)</small>
                </button>
              )}
              <p className="mm-hint">Fewer clues used = more points for you and the solver.</p>
            </form>
          )}

          {guessing && (
            <form key={shake} className={`mm-folder${shake ? ' shake' : ''}`} data-tab="Case file · your accusation" onSubmit={(e) => { e.preventDefault(); void guess(); }}>
              <div className="mm-row">
                <input className="input" placeholder="Type the word" maxLength={unknownLen ? 20 : slots.length} value={text} autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={(e) => setText(e.target.value)} />
                <button className="btn" disabled={busy || !text.trim()}>Accuse</button>
              </div>
              <p className="mm-hint">{'❤'.repeat(Math.max(0, me.hp))}{'♡'.repeat(Math.max(0, 3 - me.hp))} · a wrong accusation costs a heart</p>
            </form>
          )}

          {inRound && me.out && !me.is_mastermind && (
            <div className="mm-folder" data-tab="You're behind the glass">
              <p className="mm-hint">Back a suspect. If they crack it, you earn 3 points.</p>
              <div className="mm-row wrap">
                {lineup.filter((p) => !p.is_mastermind).map((p) => (
                  <button key={p.id} className={`btn sm ${me.backing === p.id ? '' : 'ghost'}`} disabled={busy} onClick={() => act(() => mm.back(token, p.id))}>{me.backing === p.id ? '✓ ' : ''}{p.name}</button>
                ))}
              </div>
            </div>
          )}

          {room.status === 'between' && <p className="mm-sub">Next round starting…</p>}
          {room.status === 'finished' && me.is_host && <button className="btn lg mm-cta" disabled={busy} onClick={() => act(() => mm.again(token))}>Open a new case</button>}
          {room.status === 'finished' && !me.is_host && <p className="mm-sub">Waiting for the host to open a new case…</p>}

          {room.status !== 'lobby' && room.status !== 'finished' && (
            <div className="mm-reacts" role="group" aria-label="React">
              {REACTIONS.map((e) => <button key={e} type="button" onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
            </div>
          )}
          {err && <p className="mm-err">{err}</p>}
          <button className="btn ghost sm mm-leave" onClick={() => router.push('/play')}>Leave</button>
        </div>

        {/* ---------- LEFT: suspects + scores ---------- */}
        <aside className="mm-side left">
          <div className="tag">{room.status === 'lobby' ? 'Detectives' : 'Suspects'}</div>
          <div className="mm-lineup">
            {(inRound ? lineup : board).map((p) => (
              <div key={p.id} className={`mm-suspect${p.id === me.id ? ' me' : ''}${p.is_mastermind && inRound ? ' mm' : ''}${hitId === p.id ? ' hit' : ''}`}>
                <div className="mug">{p.is_mastermind && inRound ? '💡' : p.name.slice(0, 1).toUpperCase()}</div>
                <div className="who">
                  <span className="nm">{p.name}{p.id === me.id ? ' (you)' : ''}</span>
                  <span className="hp">{inRound ? (p.is_mastermind ? 'Mastermind' : '❤'.repeat(Math.max(0, p.hp))) : ''}</span>
                </div>
                <b className="pts">{p.points}</b>
                <AnimatePresence>{deltas[p.id] > 0 && room.status === 'between' && <motion.span className="delta" initial={{ y: 8, opacity: 0 }} animate={{ y: -6, opacity: 1 }} exit={{ opacity: 0 }}>+{deltas[p.id]}</motion.span>}</AnimatePresence>
              </div>
            ))}
          </div>
        </aside>

        {/* ---------- RIGHT: behind the glass ---------- */}
        <aside className="mm-side right">
          <div className="mm-glass">
            <div className="tag">Behind the glass</div>
            {behindGlass.length === 0 ? <div className="none">{inRound ? 'Nobody eliminated yet' : 'Eliminated players watch from here'}</div> : (
              <div className="sil">
                {behindGlass.map((p) => <div key={p.id} className="ghost"><div className="mug" /><span>{p.name}</span>{p.id === me.id && <em>you</em>}</div>)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
