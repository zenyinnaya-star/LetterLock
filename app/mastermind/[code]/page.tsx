'use client';

import { ComingSoon } from '@/components/ComingSoon';
import { CLASSIC_ONLY } from '@/lib/modes';

import { shareOrigin } from '@/lib/site';
import { memo, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Header } from '@/components/ui';
import { audio } from '@/lib/audio';
import { loadToken, mm, mmAvatars, mmError, REACTIONS, saveToken, type MmState } from '@/lib/mastermind';
import { mmArtVars } from '@/lib/mmArt';
import { westArtVars } from '@/lib/westArt';
import { comicKitVars } from '@/lib/comicKit';
import { loadName } from '@/lib/session';
import { avatarColors, loadAvatar } from '@/lib/avatar';
import '../mastermind.css';
import '../mm-comic.css';
import '../mm-case.css';

function Watch({ secs, total }: { secs: number; total: number }) {
  const frac = Math.max(0, Math.min(1, total > 0 ? secs / total : 0));
  const m = Math.floor(secs / 60), sec = secs % 60;
  return (
    <motion.div className={`mx-watch${secs <= 10 && secs > 0 ? ' urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}
      initial={{ y: -80, rotate: 20, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 10 }}>
      <div className="face">
        <i className="hand min" style={{ transform: `rotate(${360 * (1 - frac)}deg)` }} />
        <i className="hand sec" style={{ transform: `rotate(${(60 - sec) * 6}deg)` }} />
        <b className="hub" />
      </div>
      <div className="digital">{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}</div>
    </motion.div>
  );
}

/** Polaroid photo: the player's own uploaded profile picture, or a coloured monogram when they have none. */
function Portrait({ name, url }: { name: string; url?: string }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" draggable={false} onError={() => setBad(true)} />;
  }
  const [c1, c2] = avatarColors(name);
  return <span className="mono" style={{ background: `linear-gradient(145deg, ${c1}, ${c2})` }}>{(name.trim()[0] ?? '?').toUpperCase()}</span>;
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
    <motion.div className={`mx-slip${isReveal ? ' reveal' : ''}`}
      initial={fresh ? { y: -90, opacity: 0, scale: 1.4, rotate: -14 } : false} animate={{ y: 0, opacity: 1, scale: 1, rotate: n % 2 ? 2.4 : -2.6 }} whileHover={{ rotate: 0, scale: 1.05, zIndex: 4 }}
      transition={{ type: 'spring', stiffness: 420, damping: 17 }}>
      <b>{isReveal ? 'EVIDENCE:' : `CLUE #${n + 1}:`}</b>
      <span>{text.slice(0, shown)}{shown < text.length && <i className="caret" />}</span>
    </motion.div>
  );
}

type Float = { id: number; emoji: string; x: number; name: string };

// Pure CSS animation: immune to the page's 4x/second clock re-renders.
const FloatEmoji = memo(function FloatEmoji({ f }: { f: Float }) {
  return <div className="mm-float" style={{ left: `${f.x}%`, ['--rot' as string]: `${(f.x % 20) - 10}deg` }}>{f.emoji}<span>{f.name}</span></div>;
});

function MastermindRoomInner({ params }: { params: Promise<{ code: string }> }) {
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
  const guessRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (shake) guessRef.current?.focus(); }, [shake]);
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
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const sentAvatar = useRef<string | null>(null);
  const prev = useRef({ clues: 0, guesses: 0, status: '', round: 0, tick: -1, react: 0, slots: '' as string, points: {} as Record<string, number> });

  useEffect(() => { setToken(loadToken(code)); setJoinName(loadName()); setReady(true); }, [code]);

  const copyInvite = useCallback(async (url: string) => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* fall back below */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); document.body.removeChild(ta);
      } catch { ok = false; }
    }
    setToast({ k: Date.now(), msg: ok ? 'Invite link copied' : `Copy failed. Share this link: ${url}` });
  }, []);

  // Poll guard: never run two state fetches at once, and drop any result older than the last one applied.
  const inflight = useRef(false);
  const seq = useRef(0);
  const applied = useRef(0);
  const refresh = useCallback(async () => {
    if (!token) return;
    if (inflight.current) return;
    inflight.current = true;
    const mine = ++seq.current;
    try {
      const st = await mm.state(token);
      if (mine < applied.current) return;
      applied.current = mine;
      offset.current = st.room.server_now - Date.now();
      setS(st);
      setErr(null);
    } catch (e) { if (mine >= applied.current) setErr(mmError(e)); }
    finally { inflight.current = false; }
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

  // share my uploaded photo with the room once, and pick up everyone else's (best effort: older servers just show initials)
  const playerCount = s?.players.length ?? 0;
  useEffect(() => {
    if (!token || !s) return;
    let live = true;
    (async () => {
      try {
        const mine = loadAvatar();
        if (mine && sentAvatar.current !== `${token}:${mine}`) { await mmAvatars.set(token, mine); sentAvatar.current = `${token}:${mine}`; }
        const all = await mmAvatars.get(token);
        if (live) setPhotos(all);
      } catch { /* migration 098 not applied: keep monograms */ }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, playerCount, s?.room.status]);

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

  // the SOLVED stamp lands on the newspaper
  const status = s?.room.status;
  useEffect(() => {
    if (status !== 'finished') return;
    const id = window.setTimeout(() => audio.stamp(), 800);
    return () => window.clearTimeout(id);
  }, [status]);

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
  useLayoutEffect(() => { const a = window.setTimeout(measure, 450), b = window.setTimeout(measure, 1200); return () => { window.clearTimeout(a); window.clearTimeout(b); }; }, [measure, clueCount, s?.room.status, s?.room.round, s?.players.length]);
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
        setToast({ k: Date.now(), msg: hits === undefined ? `${typed.toUpperCase()} is wrong` : `${typed.toUpperCase()}: ${hits} in place${mine?.near ? ` · ${mine.near} elsewhere` : ''}` });
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
        <div className="mm-room simple" style={{ ...mmArtVars, ...westArtVars, ...comicKitVars }}>
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
  if (!s) return <main className="shell narrow"><Header /><div className="mm-room simple" style={{ ...mmArtVars, ...westArtVars, ...comicKitVars }}><div className="mm-center"><p className="mm-sub">{err ?? 'Setting up the room…'}</p></div></div></main>;

  const { room, me, players } = s;
  const mmPlayer = players.find((p) => p.is_mastermind);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const activeN = players.filter((p) => !p.sitting).length;
  const board = players.filter((p) => !p.sitting).sort((a, b) => b.points - a.points);
  const inRound = room.status === 'round';
  const lineup = players.filter((p) => !p.out && !p.sitting);
  const behindGlass = inRound ? players.filter((p) => p.out && !p.is_mastermind) : [];
  const cards = Array.from({ length: room.clue_limit }, (_, i) => s.clues[i] ?? null);
  const guessing = inRound && !me.is_mastermind && !me.out;

  // letter slots on the table
  const baseKnown = s.slots && s.slots.length ? s.slots : (s.word ? s.word.toUpperCase().split('') : null);
  // letters deduced from earlier accusations (migration 082 reports which positions were exact)
  const known = baseKnown && baseKnown.map((c, i) => {
    if (c) return c;
    const g = s.guesses.find((x) => x.hit_pos?.includes(i + 1));
    return g ? (g.text[i] ?? '').toUpperCase() || null : null;
  });
  const typed = guessing ? text.toUpperCase().replace(/[^A-Z]/g, '') : '';
  const slots = known ?? Array.from({ length: 6 }, () => null as string | null);
  const unknownLen = !known;

  const strings = pins.slice(1).map((b, i) => {
    const a = pins[i];
    const sag = Math.min(46, 18 + Math.abs(b.x - a.x) * 0.12);
    return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + sag} ${b.x} ${b.y}`;
  });

  const scene = room.status === 'lobby' ? 'lobby' : room.status === 'finished' ? 'final' : 'play';
  const champ = board[0];
  const inviteUrl = `${shareOrigin()}/mastermind/${room.code}`;
  const share = async () => {
    const msg = champ ? `${champ.name} closed case ${room.code} in LetterLock Mastermind. Think you can crack the next one?` : 'LetterLock Mastermind';
    if (typeof navigator !== 'undefined' && navigator.share) { try { await navigator.share({ title: 'LetterLock Mastermind', text: msg, url: inviteUrl }); return; } catch { return; } }
    void copyInvite(inviteUrl);
  };
  const stringsSvg = (
    <svg className="mx-strings" width={corkSize.w} height={corkSize.h} aria-hidden>
      {strings.map((d, i) => <motion.path key={`${room.round}-${i}-${d.length}`} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: 0.2 + i * 0.12 }} />)}
    </svg>
  );
  const kicker = room.status === 'between'
    ? (room.solved_by ? `${nameOf(room.solved_by)} cracked it` : 'Nobody cracked it. The word was')
    : me.is_mastermind ? 'Your secret word · only you can see it' : `${mmPlayer?.name ?? ''} is hiding a ${unknownLen ? '' : `${slots.length}-letter `}word`;
  const footButtons = (
    <>
      {me.is_host && room.status !== 'finished' && (
        <button className="mx-link" disabled={busy || (!me.sitting && inRound && me.is_mastermind) || (me.sitting && inRound)} onClick={() => act(() => mm.sit(token, !me.sitting))}>
          {me.sitting ? 'Rejoin the game' : 'Sit out and keep hosting'}
        </button>
      )}
      <button className="mx-link" onClick={() => router.push('/play')}>Leave</button>
    </>
  );

  return (
    <main className="shell narrow"><Header />
      <div className={`mm-room mx s-${room.status} ${scene}${tense ? ' tense' : ''}`} style={{ ...mmArtVars, ...westArtVars, ...comicKitVars }}>
        <div className="mx-bg" aria-hidden />
        {scene !== 'final' && <div className="mx-lamp" key={flicker} data-flicker={flicker ? '1' : undefined} aria-hidden />}
        {scene === 'play' && <div className="mx-rain" aria-hidden />}
        {scene !== 'final' && <div className="mm-dust" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
        <div className="mm-vignette" aria-hidden />
        <AnimatePresence>
          {flash && <motion.div key={flash.k} className={`mm-flash ${flash.kind}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} onAnimationComplete={() => setFlash(null)} />}
        </AnimatePresence>
        <div className="mm-floats" aria-hidden>
          <AnimatePresence>{floats.map((f) => <FloatEmoji key={f.id} f={f} />)}</AnimatePresence>
        </div>
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.k} className="mx-toast" role="status" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
              onAnimationComplete={() => window.setTimeout(() => setToast((t) => (t?.k === toast.k ? null : t)), 2200)}>{toast.msg}</motion.div>
          )}
        </AnimatePresence>

        {/* =================== LOBBY: desk, case folder, cork board =================== */}
        {scene === 'lobby' && (
          <div className="mx-stage">
            <header className="mx-title">
              <motion.b initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>LETTERLOCK</motion.b>
              <motion.i initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 14 }}>MASTERMIND</motion.i>
              <em>GAME LOBBY</em>
            </header>
            <span className="mx-count">{activeN} {activeN === 1 ? 'DETECTIVE' : 'DETECTIVES'}</span>

            <motion.div className="mx-folder" initial={{ y: 120, rotate: 14, opacity: 0 }} animate={{ y: 0, rotate: -5, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 140, damping: 14, delay: 0.1 }} whileHover={{ rotate: -2, y: -8 }}>
              <span className="l1">CASE</span>
              <span className="code">{room.code}</span>
              <span className="l2">ROOM CODE</span>
              {room.quick && <span className="quick">QUICK CASE · 3 ROUNDS</span>}
            </motion.div>

            <div className="mx-board" ref={corkRef}>
              {stringsSvg}
              <motion.div className="mx-qr" data-pin initial={{ y: -50, rotate: -16, opacity: 0 }} animate={{ y: 0, rotate: -4, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 240, damping: 12 }}>
                <QRCodeSVG value={inviteUrl} size={112} level="M" marginSize={1} bgColor="#ffffff" fgColor="#111111" />
                <button type="button" onClick={() => void copyInvite(inviteUrl)}>Copy invite link</button>
              </motion.div>
              <div className="mx-mugs">
                {players.map((p, i) => (
                  <motion.div key={p.id} data-pin className={`mx-polaroid${p.id === me.id ? ' me' : ''}${p.sitting ? ' sitting' : ''}`}
                    initial={{ y: -80, opacity: 0, rotate: -20 }} animate={{ y: 0, opacity: 1, rotate: i % 2 ? 4 : -4 }}
                    transition={{ delay: 0.35 + i * 0.12, type: 'spring', stiffness: 200, damping: 10 }} whileHover={{ rotate: 0, scale: 1.07, zIndex: 6 }}>
                    <i className="pin" aria-hidden />
                    <div className="pic"><Portrait name={p.name} url={photos[p.id]} /></div>
                    <span className="cap">{p.id === me.id ? 'YOU' : p.name}{p.is_host ? ' ★' : ''}{p.sitting ? ' (watching)' : ''}</span>
                  </motion.div>
                ))}
                <motion.div className="mx-polaroid empty" initial={{ opacity: 0 }} animate={{ opacity: 1, rotate: 3 }} transition={{ delay: 0.6 }}>
                  <i className="pin" aria-hidden />
                  <div className="pic"><span className="who">?</span></div>
                  <span className="cap">WAITING…</span>
                </motion.div>
              </div>
            </div>

            <div className="mx-cta">
              {me.is_host ? (
                <motion.button className="mx-plaque big" disabled={busy || activeN < 2} onClick={() => act(() => mm.start(token))}
                  whileHover={activeN >= 2 ? { scale: 1.05, rotate: -1 } : undefined} whileTap={{ scale: 0.94 }}
                  animate={activeN >= 2 ? { rotate: [0, -1.5, 1.5, 0] } : {}} transition={{ repeat: activeN >= 2 ? Infinity : 0, repeatDelay: 2.4, duration: 0.5 }}>
                  {activeN < 2 ? 'WAITING FOR SUSPECTS…' : 'OPEN THE CASE'}
                </motion.button>
              ) : <p className="mx-note">Waiting for the host to open the case…</p>}
            </div>
            <div className="mx-foot">
              <span>{players.length < 2 ? 'Share the code. You need at least 2 detectives.' : `${players.length} detectives in the room`}</span>
              {err && <p className="mm-err">{err}</p>}
              {footButtons}
            </div>
          </div>
        )}

        {/* =================== ROUND: lamp, case file, evidence log, suspects =================== */}
        {scene === 'play' && (
          <div className="mx-stage">
            <header className="mx-title small">
              <b>LETTERLOCK</b>
              <i>MASTERMIND MODE</i>
              <em>CASE {room.code} · ROUND {room.round}/{room.total_rounds}{room.quick ? ' · QUICK' : ''}</em>
            </header>
            {inRound && <Watch secs={secsLeft} total={room.round_secs} />}

            <motion.aside className="mx-pad" initial={{ x: -80, rotate: -16, opacity: 0 }} animate={{ x: 0, rotate: -6, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 15 }}>
              <h3>EVIDENCE LOG</h3>
              {s.guesses.length === 0 ? <p className="none">No accusations yet</p> : (
                <ul>
                  {s.guesses.slice(-6).map((g, i) => (
                    <motion.li key={`${s.guesses.length}-${i}`} className={g.correct ? 'ok' : 'x'} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                      <span className="w">{g.text.toUpperCase()}</span>
                      {!g.correct && g.hits !== undefined && <span className="n">({g.hits})</span>}
                      <small>{nameOf(g.player_id)}</small>
                      <b className="mark" aria-label={g.correct ? 'correct' : 'wrong'}>{g.correct ? '✓' : '✗'}</b>
                    </motion.li>
                  ))}
                </ul>
              )}
            </motion.aside>

            <section className={`mx-file${stamp ? ' jolt' : ''}`}>
              <span className="tab">CASE FILE</span>
              <p className="mx-kicker">{kicker}</p>
              <div key={`slots${room.round}`} className={`mx-tiles${me.is_mastermind && inRound ? ' mine' : ''}`}>
                {slots.map((ch, i) => {
                  const t = typed[i];
                  const show = ch ?? t ?? '';
                  const open = !!ch || !!t;
                  const cls = ch ? (glowSlot.includes(i) ? 'paper glow' : 'paper') : t ? 'paper typed' : 'locked';
                  return (
                    <motion.div key={`${i}-${ch ?? (t ? 't' : '_')}`} className={`mx-tile ${cls}${ch && t && t !== ch ? ' clash' : ''}`}
                      initial={ch ? { rotateY: 180, scale: 1.2 } : t ? { y: -10 } : false} animate={{ rotateY: 0, scale: 1, y: 0 }}
                      transition={{ delay: room.status === 'between' ? i * 0.09 : 0, duration: 0.45 }}
                      whileTap={!open ? { rotate: [0, -8, 8, -4, 0] } : undefined}>
                      {open ? <span>{show}</span> : <span className="sr">{unknownLen ? 'unknown letter' : 'hidden letter'}</span>}
                    </motion.div>
                  );
                })}
              </div>
              <div className="mx-clues">
                {cards.map((c, i) => c
                  ? <ClueCard key={`${room.round}-${i}`} text={c} n={i} fresh={i === freshClue} />
                  : <div key={`e${room.round}-${i}`} className="mx-slip empty"><b>CLUE #{i + 1}:</b><span>{me.is_mastermind ? 'write one below' : 'waiting…'}</span></div>)}
              </div>
              <AnimatePresence>
                {stamp && room.status === 'between' && (
                  <motion.div key={stamp.k} className={`mx-stamp ${stamp.kind}`} initial={{ scale: 3.4, opacity: 0, rotate: -34 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 18 }}>{stamp.kind === 'good' ? 'CRACKED' : 'COLD CASE'}</motion.div>
                )}
              </AnimatePresence>
            </section>

            <div className="mx-board" ref={corkRef}>
              {stringsSvg}
              <div className="mx-mugs">
                {players.filter((p) => !p.sitting).map((p, i) => (
                  <motion.div key={p.id} data-pin className={`mx-polaroid${p.id === me.id ? ' me' : ''}${p.out && inRound ? ' out' : ''}${p.is_mastermind ? ' mm' : ''}`}
                    initial={{ y: -60, opacity: 0, rotate: -14 }} animate={hitId === p.id ? { x: [0, -10, 10, -6, 0], rotate: i % 2 ? 4 : -4, opacity: 1, y: 0 } : { y: 0, opacity: 1, rotate: i % 2 ? 4 : -4 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 12, delay: i * 0.08 }} whileHover={{ rotate: 0, scale: 1.08, zIndex: 6 }}>
                    <i className="pin" aria-hidden />
                    <div className="pic"><Portrait name={p.name} url={photos[p.id]} />{p.out && inRound && <b className="x" aria-hidden>✗</b>}</div>
                    <span className="cap">{p.id === me.id ? 'YOU' : p.name}</span>
                    <span className="meta">{p.is_mastermind ? 'MASTERMIND' : inRound ? `${'❤'.repeat(Math.max(0, p.hp))}${'♡'.repeat(Math.max(0, 3 - p.hp))}` : ''}</span>
                    <b className="pts">{p.points}</b>
                    <AnimatePresence>{deltas[p.id] > 0 && room.status === 'between' && <motion.span className="delta" initial={{ y: 10, opacity: 0, scale: 0.5 }} animate={{ y: -10, opacity: 1, scale: 1.2 }} exit={{ opacity: 0 }}>+{deltas[p.id]}</motion.span>}</AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mx-typer">
              {guessing && (
                <form key={shake} className={`mx-type${shake ? ' shake' : ''}`} onSubmit={(e) => { e.preventDefault(); void guess(); }}>
                  <input ref={guessRef} className="mx-input" placeholder="ENTER GUESS…" aria-label="Your guess" maxLength={unknownLen ? 20 : slots.length} value={text}
                    autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={(e) => { setText(e.target.value); audio.key(); }} />
                  <motion.button className="mx-plaque" disabled={busy || !text.trim()} whileTap={{ scale: 0.88, rotate: -4 }}>GUESS</motion.button>
                  <p className="mx-hint"><span className="hearts">{'❤'.repeat(Math.max(0, me.hp))}{'♡'.repeat(Math.max(0, 3 - me.hp))}</span> a wrong accusation costs a heart</p>
                </form>
              )}
              {inRound && me.is_mastermind && (
                <form className="mx-type" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void act(() => mm.clue(token, text)); }}>
                  <input className="mx-input" aria-label="Your clue" placeholder={room.clues_left > 0 ? `CLUE ${room.clue_limit - room.clues_left + 1}: hint without saying the word` : 'Out of clues. Sit tight.'}
                    maxLength={80} value={text} disabled={room.clues_left <= 0} onChange={(e) => { setText(e.target.value); audio.key(); }} />
                  <motion.button className="mx-plaque" disabled={busy || room.clues_left <= 0} whileTap={{ scale: 0.88, rotate: -4 }}>PIN IT</motion.button>
                  <p className="mx-hint">
                    {room.can_reveal !== undefined && (
                      <button type="button" className="mx-reveal" disabled={busy || room.clues_left <= 0 || !room.can_reveal} onClick={() => act(() => mm.reveal(token), true)}>🔎 Reveal a letter instead (costs 1 clue)</button>
                    )}
                    {room.clues_left} of {room.clue_limit} clues left · fewer clues = more points
                  </p>
                </form>
              )}
              {inRound && me.out && !me.is_mastermind && (
                <div className="mx-type col">
                  <p className="mx-hint">You&apos;re behind the glass. Back a suspect: if they crack it, you earn 3 points.</p>
                  <div className="mx-back">
                    {lineup.filter((p) => !p.is_mastermind).map((p) => (
                      <button key={p.id} className={`mx-chip${me.backing === p.id ? ' on' : ''}`} disabled={busy} onClick={() => act(() => mm.back(token, p.id))}>{me.backing === p.id ? '✓ ' : ''}{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {room.status === 'between' && (
                <div className="mx-type col">
                  <div className="mx-recap" aria-label="Round recap">
                    {players.filter((p) => (deltas[p.id] ?? 0) > 0).map((p) => <span key={p.id}><b>{p.name}</b> +{deltas[p.id]}</span>)}
                    <span className="meta">{s.clues.length}/{room.clue_limit} clues used</span>
                  </div>
                  <p className="mx-hint">{room.between_until ? `Next round in ${Math.max(0, Math.ceil((room.between_until - now) / 1000))}s…` : 'Next round starting…'}</p>
                </div>
              )}
            </div>

            <div className="mx-foot">
              <div className="mm-reacts" role="group" aria-label="React">
                {REACTIONS.map((e) => <button key={e} type="button" onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
              </div>
              {err && <p className="mm-err">{err}</p>}
              {footButtons}
            </div>
          </div>
        )}

        {/* =================== FINALE: CASE CLOSED newspaper =================== */}
        {scene === 'final' && (
          <div className="mx-stage">
            <motion.div className="mx-win" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <b>{champ && champ.id === me.id ? 'VICTORY!' : 'CASE CLOSED'}</b><i>MASTERMIND MODE</i>
            </motion.div>
            <motion.article className="mx-paper" initial={{ y: 160, rotate: 10, opacity: 0, scale: 0.7 }} animate={{ y: 0, rotate: -1.5, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 110, damping: 14 }}>
              <figure className="mx-det">
                <div className="pic">{champ ? <Portrait name={champ.name} url={photos[champ.id]} /> : null}</div>
                <figcaption>{champ ? `${champ.name} · detective on the case` : 'Detective on the case'}</figcaption>
              </figure>
              <h2 className="mx-head">CASE CLOSED</h2>
              <motion.div className="mx-solved" initial={{ scale: 4, opacity: 0, rotate: -44 }} animate={{ scale: 1, opacity: 1, rotate: -14 }} transition={{ delay: 0.75, type: 'spring', stiffness: 600, damping: 15 }}>SOLVED</motion.div>
              {s.word && (
                <div className="mx-word" aria-label={`Last word: ${s.word}`}>
                  {s.word.toUpperCase().split('').map((c, i) => (
                    <motion.span key={i} initial={{ y: -40, opacity: 0, rotate: -25 }} animate={{ y: 0, opacity: 1, rotate: i % 2 ? 2 : -2 }} transition={{ delay: 1.1 + i * 0.08, type: 'spring', stiffness: 300, damping: 14 }}>{c}</motion.span>
                  ))}
                </div>
              )}
              <div className="mx-stats">
                <span>ROUNDS: {room.total_rounds}</span>
                <span>LAST CASE CLUES: {s.clues.length}/{room.clue_limit}</span>
                <span>ACCUSATIONS: {s.guesses.length}</span>
              </div>
              <div className="mx-badges">
                {board.slice(0, 3).map((p, i) => (
                  <motion.div key={p.id} className={`mx-badge b${i}`} initial={{ scale: 0, rotate: -120 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 1.5 + i * 0.18, type: 'spring', stiffness: 260, damping: 12 }} whileHover={{ scale: 1.12, rotate: 8 }}>
                    <em>{['MASTERMIND', 'SHARP EYE', 'ON THE CASE'][i]}</em>
                    <b>{p.name}</b>
                    <span>{p.points} pts</span>
                  </motion.div>
                ))}
              </div>
              <div className="mx-btns">
                {me.is_host
                  ? <motion.button className="mx-plaque big" disabled={busy} onClick={() => act(() => mm.again(token))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}>↻ REPLAY</motion.button>
                  : <span className="mx-note dark">Waiting for the host to open a new case…</span>}
                <motion.button className="mx-plaque big pink" onClick={() => void share()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}>SHARE ⤴</motion.button>
              </div>
            </motion.article>
            <div className="mx-foot">
              {err && <p className="mm-err">{err}</p>}
              {footButtons}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function MastermindRoom(props: { params: Promise<{ code: string }> }) { return CLASSIC_ONLY ? <ComingSoon name="Mastermind" /> : <MastermindRoomInner {...props} />; }
