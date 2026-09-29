'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type { RoomState } from '@/lib/types';
import { PlayerAvatar } from './PlayerAvatar';
import './reactions.css';

type Kind = 'emoji' | 'sticker' | 'gif';
interface Floater { id: number; playerId: string; type: Kind; content: string; x: number; tilt: number }

const EMOJIS = ['😂', '🔥', '💀', '😭', '😤', '👀', '🫡', '🤯', '😈', '👏', '🙏', '🤡'];
const STICKERS = ['GG', 'SKILL ISSUE', 'COOKED', 'NO WAY', 'EZ', 'RIGGED', 'CALM DOWN', 'L', 'W', 'BRUH', 'LET HIM COOK', 'WHO DID THIS'];
const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY || 'M9Z67AoDwWL8EsQcm1eaE39S8Wxpm41L';

interface GiphyItem { id: string; images: { fixed_height_small: { url: string }; fixed_width_small: { url: string } } }

export function Reactions({ state, token }: { state: RoomState; token: string | null }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Kind>('emoji');
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [cool, setCool] = useState(false);
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<GiphyItem[]>([]);
  const seq = useRef(0);
  const playersRef = useRef(state.players);
  playersRef.current = state.players;

  const push = useCallback((playerId: string, type: Kind, content: string) => {
    const id = ++seq.current;
    setFloaters((f) => [...f.slice(-14), { id, playerId, type, content, x: Math.random() * 70, tilt: (Math.random() - 0.5) * 16 }]);
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), type === 'gif' ? 4200 : 3400);
  }, []);

  // realtime: reaction rows on the events table
  useEffect(() => {
    let cancelled = false;
    const sb = supabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    void (async () => {
      const roomId = await rpc.getRoomId(state.room.code).catch(() => null);
      if (!roomId || cancelled) return;
      channel = sb.channel(`reactions-${roomId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const row = payload.new as { kind?: string; payload?: { player_id: string; type: Kind; content: string } };
            if (row.kind === 'reaction' && row.payload) push(row.payload.player_id, row.payload.type, row.payload.content);
          })
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) void sb.removeChannel(channel); };
  }, [state.room.code, push]);

  // GIF search (only when a GIPHY key is configured)
  useEffect(() => {
    if (!GIPHY_KEY || tab !== 'gif' || !open) return;
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      const endpoint = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q.trim())}&limit=12&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=pg-13`;
      try {
        const res = await fetch(endpoint, { signal: ctrl.signal });
        const json = (await res.json()) as { data: GiphyItem[] };
        setGifs(json.data ?? []);
      } catch { /* aborted or offline */ }
    }, 300);
    return () => { window.clearTimeout(id); ctrl.abort(); };
  }, [q, tab, open]);

  async function send(type: Kind, content: string) {
    if (!token || cool) return;
    setCool(true);
    window.setTimeout(() => setCool(false), 1300);
    setOpen(false);
    const { error } = await supabase().rpc('send_reaction', { p_token: token, p_kind: type, p_content: content });
    if (error && !/SLOW_DOWN/.test(error.message)) console.warn('reaction failed', error.message);
  }

  const who = (id: string) => playersRef.current.find((p) => p.id === id);

  return (
    <>
      <div className="rx-stream" aria-live="off">
        <AnimatePresence>
          {floaters.map((f) => {
            const p = who(f.playerId);
            return (
              <motion.div key={f.id} className={`rx-bubble ${f.type}`} style={{ right: `${f.x}px` }}
                initial={{ y: 40, opacity: 0, scale: 0.4, rotate: 0 }}
                animate={{ y: -300, opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 0.95], rotate: f.tilt }}
                transition={{ duration: f.type === 'gif' ? 4 : 3.2, ease: 'easeOut', times: [0, 0.12, 0.75, 1] }}
                exit={{ opacity: 0 }}>
                {f.type === 'emoji' && <span className="rx-emoji">{f.content}</span>}
                {f.type === 'sticker' && <span className="rx-sticker">{f.content}</span>}
                {f.type === 'gif' && /^https:\/\/media\d*\.giphy\.com\//.test(f.content) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="rx-gif" src={f.content} alt="GIF reaction" />
                )}
                {p && <span className="rx-from"><PlayerAvatar p={p} size={16} /> {p.name}</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {token && (
        <div className="rx-dock">
          <AnimatePresence>
            {open && (
              <motion.div className="rx-panel" initial={{ opacity: 0, y: 12, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.95 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
                <div className="rx-tabs" role="tablist">
                  {(['emoji', 'sticker', ...(GIPHY_KEY ? ['gif'] as const : [])] as Kind[]).map((k) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                      {k === 'emoji' ? tr('rx.emoji') : k === 'sticker' ? tr('rx.memes') : tr('rx.gifs')}
                    </button>
                  ))}
                </div>
                {tab === 'emoji' && (
                  <div className="rx-grid emoji">
                    {EMOJIS.map((e) => (
                      <motion.button key={e} whileHover={{ scale: 1.25 }} whileTap={{ scale: 0.85 }} onClick={() => void send('emoji', e)} aria-label={`Send ${e}`}>{e}</motion.button>
                    ))}
                  </div>
                )}
                {tab === 'sticker' && (
                  <div className="rx-grid sticker">
                    {STICKERS.map((s) => (
                      <motion.button key={s} whileHover={{ rotate: -3, scale: 1.05 }} whileTap={{ scale: 0.9 }} onClick={() => void send('sticker', s)}>{s}</motion.button>
                    ))}
                  </div>
                )}
                {tab === 'gif' && (
                  <div className="col" style={{ gap: 8 }}>
                    <input className="input" style={{ fontSize: 15, padding: '9px 12px' }} placeholder={tr('rx.search')} value={q} onChange={(e) => setQ(e.target.value)} />
                    <div className="rx-grid gif">
                      {gifs.map((g) => (
                        <button key={g.id} onClick={() => void send('gif', g.images.fixed_height_small.url)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.images.fixed_width_small.url} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                    <span className="muted small" style={{ textAlign: 'right' }}>{tr('rx.powered')}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button className={`rx-fab${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} whileTap={{ scale: 0.9 }}
            aria-label={open ? tr('rx.close') : tr('rx.send')} aria-expanded={open} disabled={cool && !open}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1.9 2 5.1 2 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="3" />
            </svg>
          </motion.button>
        </div>
      )}
    </>
  );
}
