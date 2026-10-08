// Same shape as CLASS_GUIDE, for the five story heroes.
export interface HeroGuide { style: string; difficulty: 1 | 2 | 3; power: string; price: string; how: string; tips: string[]; counter: string }
export const HERO_GUIDE: Record<string, HeroGuide> = {
  Shiro: { style: 'Fast striker', difficulty: 2, power: 'Inkflow: strong hits carry extra power into the next turn.', price: 'Low Vitality and Willpower, so he folds fast to Corruption.',
    how: 'Shiro acts first and hits hard. Use quick attacks to build the Odds meter, then finish encounters before the enemy turn bites.',
    tips: ['Attack early: his speed lets him strike before most enemies.', 'Read the Book of Wisdom for a Special Attack when a big enemy is up.', 'Let a tank soak the damage while you pile on hits.'], counter: 'Weak to Corruption and area attacks, so stay out of the boss\'s tax rounds.' },
  Nero: { style: 'Tank', difficulty: 1, power: 'Hold the Line: Guard also shields the ally next in turn order.', price: 'Slow and low on Luck, so he rarely crits or dodges.',
    how: 'Nero is the wall. Guard on dangerous turns to protect the whole team, and attack when the coast is clear.',
    tips: ['Guard before the boss\'s area attacks.', 'Watch the intent icons above enemies and guard when you see a 💥.', 'Your shield helps the ally acting after you most.'], counter: 'Low damage means long fights. Pair with a striker.' },
  Kira: { style: 'Luck & utility', difficulty: 3, power: 'Second Draw: draws an extra card and sees one enemy intent early.', price: 'Fragile, with low Vitality and Willpower.',
    how: 'Kira lives on luck. Crits come often, which gives Haste and fills Odds. Use her Book answers to stock specials.',
    tips: ['Crit chains give Haste, so you act earlier next turn.', 'Open the Book every turn you can.', 'Keep behind Nero\'s shield.'], counter: 'Focus fire kills her quickly. Keep her out of the front.' },
  Mira: { style: 'Seer & healer', difficulty: 2, power: 'Clear Voice: heals also lift one Corruption stack.', price: 'Low Lexicon, so her own attacks are weak.',
    how: 'Mira keeps the party alive. Use heal specials and her ultimate to revive and restore everyone.',
    tips: ['Save the ultimate for when two heroes are down.', 'Cleanse Corruption before it stacks.', 'Heal specials target the lowest HP ally.'], counter: 'Slow teams that need her heals can fall behind if she goes down first.' },
  Prince: { style: 'Commander', difficulty: 1, power: 'Royal Decree: balanced stats and a strong all-round ultimate.', price: 'No standout stat. He is good at everything, great at nothing.',
    how: 'The Prince is the easiest hero to pick up. Attack, guard, and use specials as the situation calls for.',
    tips: ['Fill gaps in the party: guard if you lack a tank, attack if you lack damage.', 'Build Odds with steady attacks.', 'His ultimate hits all enemies and heals allies.'], counter: 'Specialists outperform him in their role.' },
};
