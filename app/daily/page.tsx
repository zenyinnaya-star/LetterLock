'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Header, Tile } from '@/components/ui';
import { Icon } from '@/components/icons';
import { daily, readStreak, recordStreak, type DailyInfo } from '@/lib/daily';
import { friendlyError, REASONS } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import { audio } from '@/lib/audio';
import { loadName, saveName } from '@/lib/session';

export default function DailyPage() {
  const t = useT();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [streak, setStreak] = useState(0);
  const offset = useRef(0);
  const finishing = useRef(false);

  const apply = useCallback((i: DailyInfo) => { offset.current = new Date(i.now).getTime() - Date.now(); setInfo(i); }, []);
  useEffect(() => { setName(loadName()); setStreak(readStreak()); daily.info().then(apply).catch((e) => setErr(friendlyError(e))); }, [apply]);

  const playing = info?.status === 'playing';
  useEffect(() => {
    if (!playing || !info?.ends_at) return;
    const end = new Date(info.ends_at).getTime();
    const tick = () => setLeft(Math.max(0, end - (Date.now() + offset.current)));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [playing, info?.ends_at]);

  useEffect(() => {
    if (!playing || left > 0 || finishing.current || !info?.ends_at) return;
    finishing.current = true;
    audio.file('victory');
    void daily.finish().then((i) => { apply(i); if (i.score > 0) setStreak(recordStreak(i.day)); }).finally(() => { finishing.current = false; });
  }, [left, playing, info?.ends_at, apply]);

  async function start() {
    setBusy(true); setErr(null);
    try { saveName(name.trim()); audio.unlock(); apply(await daily.start(name.trim() || 'Player')); } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const w = word.trim();
    if (!w || busy || !info) return;
    setBusy(true);
    try {
      const r = await daily.answer(w);
      if (r.valid) {
        audio.success();
        setMsg({ ok: true, text: `+${r.points}` });
        setInfo({ ...info, score: r.score, words: [...info.words, { word: r.word, points: r.points }] });
      } else { audio.buzzer(); setMsg({ ok: false, text: REASONS[r.reason ?? ''] ?? t('er.generic') }); }
      setWord('');
    } catch (e2) { setMsg({ ok: false, text: friendlyError(e2) }); }
    setBusy(false);
  }
  async function share() {
    if (!info) return;
    const text = t('dc.share_text', { day: info.day, n: info.score, rank: info.rank ?? '–' }) + ' ' + window.location.origin + '/daily';
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); setMsg({ ok: true, text: t('dc.copied') }); } catch { /* cancelled */ }
  }

  return (
    <main className="shell narrow">
      <Header />
      <div className="sheet daily-page">
        <h1 className="stage-title"><Icon name="trophy" size={22} /> {t('dc.title')}</h1>
        {err && <p className="center" style={{ color: 'var(--lock)' }}>{err}</p>}
        {!info && !err && <p className="muted center">…</p>}
        {info && (
          <>
            <div className="dc-puzzle">
              <span className="muted small">{info.day}</span>
              <b className="dc-prompt">{info.prompt}</b>
              <div className="dc-banned"><span className="muted small">{t('dc.banned')}</span>
                <span className="tiles">{info.banned.split('').map((c) => <Tile key={c} letter={c} small locked={false} />)}</span>
              </div>
            </div>

            {info.status === 'new' && (
              <div className="col" style={{ gap: 10 }}>
                <p className="muted center">{t('dc.rules', { s: info.seconds })}</p>
                <input className="input" maxLength={20} value={name} placeholder={t('home.name_ph')} aria-label={t('home.name_ph')}
                  onChange={(e) => setName(e.target.value)} />
                <button className="btn lg block" disabled={busy} onClick={() => void start()}>{t('dc.start')}</button>
                {streak > 0 && <p className="muted small center">{t('dc.streak', { n: streak })}</p>}
              </div>
            )}

            {info.status === 'playing' && (
              <div className="col" style={{ gap: 10 }}>
                <div className="dc-hud"><span className={`dc-clock${left < 10000 ? ' urgent' : ''}`}>{Math.ceil(left / 1000)}s</span><b>{info.score} {t('tm.pts')}</b></div>
                <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={(e) => void submit(e)}>
                  <input className="input" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} value={word} maxLength={24}
                    onChange={(e) => setWord(e.target.value)} aria-label={t('dc.title')} style={{ flex: 1, minWidth: 0 }} />
                  <button className="btn" disabled={busy || !word.trim()}>{t('ph.lock')}</button>
                </form>
                <div className="dc-msg" aria-live="polite" style={{ color: msg?.ok ? 'var(--ok)' : 'var(--lock)' }}>{msg?.text ?? ' '}</div>
                <div className="dc-words">
                  {[...info.words].reverse().map((w) => (
                    <motion.span key={w.word} className="dc-word" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{w.word} <b>+{w.points}</b></motion.span>
                  ))}
                </div>
              </div>
            )}

            {info.status === 'done' && (
              <div className="col" style={{ gap: 10 }}>
                <div className="dc-result">
                  <b>{info.score}</b><span className="muted">{t('tm.pts')}</span>
                  {info.rank != null && <span className="dc-rank">#{info.rank}</span>}
                </div>
                <div className="dc-words">{info.words.map((w) => <span key={w.word} className="dc-word">{w.word} <b>+{w.points}</b></span>)}</div>
                {streak > 0 && <p className="muted small center">{t('dc.streak', { n: streak })}</p>}
                <button className="btn block" onClick={() => void share()}>{t('dc.share')}</button>
                <p className="muted small center">{t('dc.come_back')}</p>
              </div>
            )}

            <span className="label">{t('dc.board')}</span>
            <ol className="dc-board">
              {info.board.length === 0 && <li className="muted">{t('dc.empty')}</li>}
              {info.board.map((b, i) => (
                <li key={i} className={b.me ? 'me' : ''}><span className="dc-pos">{i + 1}</span><span className="dc-name">{b.name}</span><span className="muted small">{b.words}w</span><b>{b.score}</b></li>
              ))}
            </ol>
          </>
        )}
      </div>
    </main>
  );
}
