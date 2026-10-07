// The five story heroes. Portraits are hosted on the Higgsfield CDN until self-hosted copies land in /public/art/heroes.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
export type HeroId = 'Shiro' | 'Nero' | 'Kira' | 'Mira' | 'Prince';

export interface Hero {
  id: HeroId; name: string; role: string; tagline: string; signature: string; color: string; art: string; artFull: string;
  stats: { VIT: number; LEX: number; FOC: number; SPD: number; WIL: number; LUK: number };
}

const ids: Record<HeroId, string> = {
  Shiro: '20261007_222914_198280ba-67eb-46c0-89f5-45c635d8fd96',
  Nero: '20261007_222913_96c559cc-48f1-4346-9a77-4e2466b1f75e',
  Kira: '20261007_222913_bdc86b5f-b517-4cb8-b06a-664e6b830349',
  Mira: '20261007_222914_dddaa56a-d016-42aa-ace7-b50bdb5dcf5b',
  Prince: '20261007_222943_272c4991-c85f-464c-b1fa-15f0b146c426',
};
const art = (id: HeroId) => ({ art: `/art/heroes/${id.toLowerCase()}.webp, ${CDN}${ids[id]}_min.webp`, artFull: `${CDN}${ids[id]}.png` });

export const HEROES: Hero[] = [
  { id: 'Shiro', name: 'Shiro', role: 'Fast Striker', tagline: 'Fast hands, long words.', color: '#93c5fd',
    signature: 'Inkflow: 7+ letter words carry 25% of their Power into next turn.', stats: { VIT: 4, LEX: 7, FOC: 5, SPD: 8, WIL: 3, LUK: 3 }, ...art('Shiro') },
  { id: 'Nero', name: 'Nero', role: 'Tank', tagline: 'The wall the party hides behind.', color: '#94a3b8',
    signature: 'Hold the Line: Guard also shields the ally next in turn order.', stats: { VIT: 8, LEX: 5, FOC: 4, SPD: 3, WIL: 7, LUK: 3 }, ...art('Nero') },
  { id: 'Kira', name: 'Kira', role: 'Luck & Utility', tagline: 'Cards up her sleeve, dice in her pocket.', color: '#f472b6',
    signature: 'Second Draw: draws an extra card and sees one enemy intent early.', stats: { VIT: 3, LEX: 4, FOC: 6, SPD: 6, WIL: 3, LUK: 8 }, ...art('Kira') },
  { id: 'Mira', name: 'Mira', role: 'Seer & Healer', tagline: 'Her voice mends what the IRS breaks.', color: '#34d399',
    signature: 'Clear Voice: heals also lift one Corruption stack.', stats: { VIT: 5, LEX: 3, FOC: 7, SPD: 4, WIL: 7, LUK: 4 }, ...art('Mira') },
  { id: 'Prince', name: 'The Prince', role: 'Commander', tagline: 'Lost his kingdom. Not his nerve.', color: '#fbbf24',
    signature: 'Royal Decree: once per battle, an ally acts first.', stats: { VIT: 5, LEX: 5, FOC: 5, SPD: 5, WIL: 5, LUK: 5 }, ...art('Prince') },
];
export const heroById = (id: string | null | undefined) => HEROES.find((h) => h.id === id);
