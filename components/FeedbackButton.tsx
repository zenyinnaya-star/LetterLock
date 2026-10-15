'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Icon } from './icons';

/** Small "About / Feedback" button: who made the game + a box to send suggestions or complaints. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'err'>('idle');

  async function send() {
    if (msg.trim().length < 3) return;
    setState('busy');
    try {
      const room = window.location.pathname.startsWith('/room/') ? window.location.pathname.split('/')[2] : null;
      const { error } = await supabase().rpc('submit_feedback', { p_message: msg, p_contact: contact, p_room: room, p_url: window.location.pathname, p_ua: navigator.userAgent });
      if (error) throw error;
      setState('sent'); setMsg(''); setContact('');
    } catch { setState('err'); }
  }

  return (
    <>
      <button type="button" className="iconbtn" aria-label="About and feedback" title="About & feedback" onClick={() => { setState('idle'); setOpen(true); }}>
        <Icon name="bulb" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="pve-lock" role="dialog" aria-modal="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <h2>About LetterLock</h2>
              <p>LetterLock is a word game where typed words are weapons. It is made by Zabdiel (Zachary) Enyinnaya, a student developer who builds it with friends in mind.</p>
              <h2 style={{ fontSize: 18 }}>Tell me what to improve</h2>
              <textarea className="input" rows={4} maxLength={1000} value={msg} placeholder="Suggestions, bugs, complaints, ideas…" onChange={(e) => { setMsg(e.target.value); setState('idle'); }} />
              <input className="input" maxLength={120} value={contact} placeholder="Name or email (optional, if you want a reply)" onChange={(e) => setContact(e.target.value)} />
              {state === 'sent' && <div className="note">Thanks, your feedback was sent.</div>}
              {state === 'err' && <div className="note bad">Could not send. Please try again.</div>}
              <div className="row">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
                <button type="submit" className="btn lg" disabled={msg.trim().length < 3 || state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Send'}</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
