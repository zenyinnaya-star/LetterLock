// The five story heroes. Portraits are hosted on the Higgsfield CDN until self-hosted copies land in /public/art/heroes.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
const P = (id: string) => `${CDN}${id}.png`;
// fresh square portraits (class-select style), same characters
export const HERO_PORTRAIT: Record<string, string> = {
  Shiro: P('20261008_123836_1ae117da-3ce9-48ab-ac5d-db6c59b90caf'),
  Nero: P('20261008_123837_c867849d-c2bb-455c-9367-0b018579d699'),
  Kira: P('20261008_123859_506eb1c5-2b8e-49b5-a5b2-4508f922f429'),
  Mira: P('20261008_123837_7b10d081-f74b-497b-b1e4-f78341f60beb'),
  Prince: P('20261008_123838_20849701-e57e-4609-856e-157f5d961196'),
};
export type HeroId = 'Shiro' | 'Nero' | 'Kira' | 'Mira' | 'Prince';

export interface Hero {
  id: HeroId; name: string; role: string; tagline: string; signature: string; color: string; art: string; artFull: string;
  stats: { VIT: number; LEX: number; FOC: number; SPD: number; WIL: number; LUK: number };
}

const ids: Record<HeroId, string> = {
  Shiro: '20261008_015326_684f5384-e54e-4848-becb-2a1471d0ab6e',
  Nero: '20261008_015254_a3d67e43-a3ff-42d7-8e5d-7b2e128d774b',
  Kira: '20261008_015256_276e1e64-48fb-47e4-92fb-53a72734886f',
  Mira: '20261008_015258_4c233066-9d98-45af-94f0-5a78fdeb0699',
  Prince: '20261008_015300_99da7422-382b-41c2-b12b-158e44632523',
};
// transparent cutouts (v3): one image for cards, portraits and the battle sprite
const art = (id: HeroId) => ({ art: `${CDN}${ids[id]}.png`, artFull: `${CDN}${ids[id]}.png` });

export const HEROES: Hero[] = [
  { id: 'Shiro', name: 'Shiro', role: 'Fast Striker', tagline: 'Fast hands, long words.', color: '#93c5fd',
    signature: 'Inkflow: 7+ letter words carry 25% of their Power into next turn.', stats: { VIT: 4, LEX: 7, FOC: 5, SPD: 8, WIL: 3, LUK: 3 }, ...art('Shiro') },
  { id: 'Nero', name: 'Nero', role: 'Tank', tagline: 'The wall the party hides behind.', color: '#94a3b8',
    signature: 'Hold the Line: Guard also shields the ally next in turn order.', stats: { VIT: 8, LEX: 5, FOC: 4, SPD: 3, WIL: 7, LUK: 3 }, ...art('Nero') },
  { id: 'Kira', name: 'Kira', role: 'Luck & Utility', tagline: 'Cards up her sleeve, dice in her pocket.', color: '#cbd5e1',
    signature: 'Second Draw: draws an extra card and sees one enemy intent early.', stats: { VIT: 3, LEX: 4, FOC: 6, SPD: 6, WIL: 3, LUK: 8 }, ...art('Kira') },
  { id: 'Mira', name: 'Mira', role: 'Seer & Healer', tagline: 'Her voice mends what the IRS breaks.', color: '#34d399',
    signature: 'Clear Voice: heals also lift one Corruption stack.', stats: { VIT: 5, LEX: 3, FOC: 7, SPD: 4, WIL: 7, LUK: 4 }, ...art('Mira') },
  { id: 'Prince', name: 'The Prince', role: 'Commander', tagline: 'Lost his kingdom. Not his nerve.', color: '#fbbf24',
    signature: 'Royal Decree: once per battle, an ally acts first.', stats: { VIT: 5, LEX: 5, FOC: 5, SPD: 5, WIL: 5, LUK: 5 }, ...art('Prince') },
];
export const heroById = (id: string | null | undefined) => HEROES.find((h) => h.id === id);

// What every stat actually does in battle (kept in sync with the server rules).
export const STAT_INFO: Record<keyof Hero['stats'], { name: string; what: string }> = {
  VIT: { name: 'Vitality', what: 'Max HP. Every point is +6 HP.' },
  LEX: { name: 'Lexicon', what: 'Word power. Every point makes your words hit about 4% harder, and crits do more damage.' },
  FOC: { name: 'Focus', what: 'Accuracy. Every point is +1% chance to land your hit.' },
  SPD: { name: 'Speed', what: 'Acts earlier in the turn and dodges more. Every point is +1.5% dodge (up to 40%).' },
  WIL: { name: 'Willpower', what: 'Resists Corruption. Every point is +4% chance to shrug it off (up to 60%).' },
  LUK: { name: 'Luck', what: 'Crit chance. Every point is +1% (on top of a 5% base), plus a little accuracy.' },
};
export const GLOSSARY: { term: string; what: string }[] = [
  { term: 'Power', what: 'How strong your action is. Longer, rarer words and answering fast raise it.' },
  { term: 'Shield', what: 'Absorbs damage before your HP. Guard builds it.' },
  { term: 'Crit', what: 'A lucky hit for extra damage. Chance comes from Luck.' },
  { term: 'Weakness / Resist', what: 'Each prompt has an element. Hitting an enemy weak to it does +50% damage, a resisted element does 40% less.' },
  { term: 'Momentum', what: 'Team meter. Hits, weaknesses, crits and guards fill it; misses drain it. At 100 the team unleashes a Limit Break.' },
  { term: 'Ultimate (n/6)', what: 'Your hero charges one step per turn you act. At 6/6 you can unleash your ultimate.' },
  { term: 'Corruption', what: 'A curse from enemy taxes that locks more letters. Willpower helps you resist it.' },
  { term: 'Hero level', what: 'Each hero levels up from the XP they earn on runs. Every level gives 1 upgrade point.' },
];
