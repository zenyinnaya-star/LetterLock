'use client';
import { createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import en from './en';
import { DICTS, getLang, LANG_EVENT, langVersion, t, type Key, type UiLang } from './index';

/** Re-render when the language changes; returns the translate function. */
export function useT() {
  const [seen, setSeen] = useState(langVersion);
  useEffect(() => {
    const on = () => setSeen(langVersion());
    window.addEventListener(LANG_EVENT, on);
    if (langVersion() !== seen) on(); // language switched between our render and this effect
    return () => window.removeEventListener(LANG_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return t;
}

export function useLang(): UiLang {
  useT();
  return getLang();
}

/** Render a translated string, turning **x** into bold. Vars may be React nodes. */
export function Rich({ k, vars }: { k: Key; vars?: Record<string, ReactNode> }): ReactNode {
  useT();
  const raw: string = DICTS[getLang()][k] ?? en[k] ?? k;
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  const fill = (seg: string): ReactNode[] => seg.split(/(\{\w+\})/g).map((x, i) => {
    const m = /^\{(\w+)\}$/.exec(x);
    return m && vars && m[1] in vars ? createElement(Fragment, { key: i }, vars[m[1]]) : x;
  });
  return createElement(Fragment, null, ...parts.map((p, i) => (p.startsWith('**') && p.endsWith('**')
    ? createElement('b', { key: i }, ...fill(p.slice(2, -2)))
    : createElement(Fragment, { key: i }, ...fill(p)))));
}
