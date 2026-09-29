import { isKana, toRomaji } from 'wanakana';

/**
 * What the player typed → what we send + the a–z letters we can preview (for the banned-letter warning).
 * The server does the real normalization; this only mirrors it so the preview is honest.
 *  - es/fr/de: accents folded (árbol → arbol, ß → ss)
 *  - ja: kana converted to romaji here (ねこ → neko); kanji are converted on the server (猫 → neko)
 *  - zh: tone marks folded (píngguǒ → pingguo); hanzi are converted on the server (苹果 → pingguo)
 */
export function prepareAnswer(raw: string, lang: string | undefined): { send: string; letters: string; native: boolean } {
  let v = raw.trim();
  if (lang === 'ja' && v && isKana(v)) v = toRomaji(v);
  const native = /[぀-ヿ㐀-鿿]/.test(v) && (lang === 'ja' || lang === 'zh');
  if (native) return { send: v, letters: '', native: true };
  const folded = v.toLowerCase().replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const letters = folded.replace(/[^a-z]/g, '');
  return { send: letters, letters, native: false };
}
