# Letterlock PvE Co-op Mode: Design Spec (v1, planning only)

Status: planning. Nothing here is built yet. Open items are listed at the end.

## 1. Summary

A turn-based, co-op RPG mode for 1-4 players. Every action is gated by answering a word prompt: a valid word becomes **Power**, charges ultimates, draws cards and unlocks skills. Solo is a party of one (bots may fill empty slots). This is a **new mode**; Solo vs Bots stays.

Tone: epic fantasy with light humor. Visuals: hybrid 2D (see section 12).

## 2. Story

- The Alphabet has been shattered and letters are being locked away.
- **Economy** was a legendary villain. His son **Government**, a dragon, took the Prince's kingdom.
- **The IRS** are Government's minions and the enemies on the way to him.
- The 12 old classes are the **mentors** (exiles and survivors of the old kingdom). Each teaches a **pathway**.
- Keep the satire generic: no real logos, people or political messaging.

## 3. Heroes (5, pick up to 4, no duplicates in a party; solo can use any)

| Hero | Gender | Role | Stats (30 pts) | Signature | Natural pathways |
|---|---|---|---|---|---|
| Shiro | boy | Fast striker | SPD 8, LEX 7, FOC 5, VIT 4, WIL 3, LUK 3 | Inkflow: 7+ letter words carry 25% of their Power into next turn | Ninja, Mastermind, Thief |
| Nero | boy | Tank | VIT 8, WIL 7, LEX 5, FOC 4, SPD 3, LUK 3 | Hold the Line: Guard also shields the ally next in turn order | Hero, Villain, Parasite |
| Kira | girl | Luck/utility | LUK 8, SPD 6, FOC 6, LEX 4, VIT 3, WIL 3 | Second Draw: extra card, sees one enemy intent early | Gambler, Wildcard, Jester |
| Mira | girl | Seer/healer | WIL 7, FOC 7, VIT 5, LUK 4, SPD 4, LEX 3 | Clear Voice: heals also lift one letter lock (and optionally one Corruption stack) | Oracle, Hacker, Mimic |
| The Prince | man | Commander | 5 in every stat | Royal Decree: once per battle, an ally acts first; nearby allies +1 SPD | Hero, Oracle, Villain |

All five are available from the start. Heroes have a fixed identity; customization is cosmetic only (section 12).

## 4. Turn loop (simultaneous answers, speed-ordered resolve)

1. **Telegraph:** each enemy's intent is shown and it picks targets. Letter locks and curses are applied.
2. **Answer phase:** everyone gets the same prompt and a shared timer (soft timer; speed gives a crit window). The word is checked by the existing checker. Result: Power.
3. **Action phase:** each player locks in an action: Attack, Guard, Skill (word-gated), Card, Ultimate, or Item.
4. **Resolve:** all combatants (players and enemies) are sorted into one initiative order and act one by one. The turn-order bar is visible in the UI.
5. **Enemy phase / status tick.**

An invalid word = Power 0 for that turn. A locked letter breaks the combo.

### Power
`Power = letters x (1 + LEX x 0.04) + rarity bonus + speed bonus + legendary bonus`
Valid word also builds a combo streak, charges the ultimate and draws a card.

### Initiative
`Initiative = SPD + answer speed (0..5) + action priority + status modifiers`
Action priority: Guard +4, Heal/Card +2, Attack 0, Skill -2, Ultimate -3.
Ties: higher LUK, then a seeded random. A kill or stun before an enemy's turn cancels its action.

### Hit, miss, dodge
`Hit chance = 90% + Accuracy - Evasion` (clamped 10%..95%)
- Accuracy = FOC x 1% + LUK x 0.5% + 2% per letter over 5 (cap +30%)
- Evasion = SPD x 1.5% (cap 40%)
- Lucky reroll of a miss: LUK x 1% (cap 25%)
- Pity: after 2 misses in a row the next attack hits.
- Single-target strikes can be dodged; party-wide hits are halved by evasion; debuffs use resist; boss ultimates cannot be dodged. Skills may be marked "never miss".
- The target tooltip shows hit chance. Rolls are server-seeded (battle, turn, actor).

## 5. Stats

Six primary stats: VIT, LEX, FOC, SPD, WIL, LUK. Stats amplify words but never replace them. Soft cap at 30 (half effect beyond). Level cap 20 for v1.
Sources: hero base + level growth (+1 free point per level) + skill tree + gear + relics + buffs/debuffs. Respec costs gold.

Key substats (all derived server-side in `_stats()`, caps in a `stat_caps` table):

- Offense: Power per letter, crit chance (5% + LUK x 1%, cap 50%), crit damage (150% + LEX x 1%, cap 250%), accuracy, armor pierce, combo bonus, skill power.
- Defense: max HP (40 + VIT x 6), armor, evasion, shield strength, block, counter.
- Speed: initiative, fast window (30% + SPD x 1% of timer), turn timer (20s + FOC x 0.5s, cap +10s), haste on dodge.
- Support: heal power, healing received, revive strength, cleanse power, ultimate charge rate, ultimate cost reduction.
- Resistances: lock ward (1 per 8 WIL), silence, weaken, slow, blind, poison, corruption (each x2% from the matching stat, cap 60%/50%).
- Word/cards: rare-letter bonus, long-word bonus, card draw, hand size, lucky reroll, typo grace.
- Progression: XP bonus, gold bonus, reward odds.

Character sheet has a stats tab and a substats tab with a source breakdown tooltip.

## 6. Classes become pathways; skills, cards, items

- 12 pathways (the old classes): Ninja, Mastermind, Hero, Villain, Hacker, Mimic, Gambler, Thief, Parasite, Oracle, Wildcard, Jester.
- A hero picks **one pathway** at the first mentor checkpoint (a second at a higher level later). Each hero has 3 natural pathways (bonus XP + small stat boost), but any pathway is allowed.
- A pathway grants: its skill tree branch, its ultimate (the existing 12), a stat modifier, a signature **camp feature** (section 9), and mentor dialogue.
- **Skills are word-gated** (examples): 6+ letters, contains J/Q/X/Z/K, starts and ends with a vowel, chain word (starts with last letter of previous word). These reuse the Mind Games checks.
- **Cards** (instant, no word needed, max 2 per turn, hand of 2-3): Attack, Shield, Cleanse, Heal (25% HP + VIT bonus), Greater Heal, Group Heal, Revive. Heal cards have +2 initiative priority. A valid word draws a card (situation-weighted).
- **Status effects:** Silence, Slow, Weaken, Blind, Poison, Mark, Corruption.

## 7. Skill trees

Visual reference: the Arc Raiders skill tree. Three coloured branches grow from one root, plus a gold pathway branch.

- Branches: **Power** (red), **Resolve** (cyan), **Wit** (yellow), **Pathway** (gold).
- A web, not a strict tree: paths split and merge; some nodes need two neighbours.
- Node sizes: small (stat), medium (skill), large (keystone/capstone at tips and junctions). Keystones are the word-gated special skills.
- States: locked (dim), available (pulsing), unlocked (filled).
- SVG renderer with pan/zoom, tap a node for a detail panel (cost, effect, requirement), animated unlock.
- Data driven: `skill_nodes` (tree, branch, x, y, size, kind, cost, requires, effect, condition) and `profile_nodes`. Original icons, no copied assets.
- XP from runs gives skill points; capstones unlock at levels or milestones (for example, beat the boss without a wipe).

## 8. Run structure (30-35 min; short run also available)

3 acts, 9 encounters:

| Act | Encounters |
|---|---|
| 1 Outer Provinces (bright) | Battle 1, Battle 2, Captain 1 |
| 2 Midlands (moody) | Battle 3, Battle 4, Captain 2 |
| 3 The Capital (dark) | Battle 5, Captain 3, Government (boss) |

A **shop/camp** follows each captain (3 per run). Short run: the original 4 battles + boss.

### Enemies (the IRS)
- **Intern Auditor:** "Audit" locks 1 letter. Easy.
- **The Collector:** "Garnish" drains Power; "Deduction" shield broken by long words; silences your best skill.
- **The Twin Filers (2 enemies):** one only accepts a category prompt, the other mirrors your last action.
- **The Commissioner:** locks 3 letters across the party; "Late Fee" punishes repeated words.

### Captains (2 phases, mini-ultimate, drop a rare relic)
- **Captain of Audits:** heavy locks. Mini-ult **Full Audit** (locks 3 letters on everyone for a turn). Boon: Red Tape telegraphed 2 turns early.
- **Captain of Collections:** steals Power/charge, high shield. Mini-ult **Garnishment**. Boon: Taxes Corruption capped at 2 stacks.
- **Captain of Penalties:** stacks Slow, Weaken, Poison. Mini-ult **Late Fees**. Boon: Tax Season deals reduced damage.

### Boss: Government (dragon, 3 phases)
- Telegraphs each ultimate one turn ahead. Interrupt it by dealing enough damage / breaking its shield.
- **Red Tape:** locks 4 letters on every player for 2 turns (phase 1+).
- **Shutdown:** silences the whole party's skills for a turn (phase 2+).
- **Taxes:** applies **Corruption** (phases 2-3). Marked players get 2 stacks.
- **Tax Season:** huge party-wide hit (phase 3). Must be shielded or survived.
- **Bailout:** heals him; interruptible.

**Corruption:** stacks to 3; each stack takes 10% of the player's earned Power and feeds Government's ultimate charge; at 3 stacks you also lose a card each turn. Does not expire until cleansed; resets after the battle. WIL gives a resist roll when applied. Cleanse removes 1 stack (Full Cleanse removes all); Mira's Clear Voice may lift 1.

### Raid levels (5)
Chosen by the host; clearing a level unlocks the next. Captains scale hardest.

| Lvl | Name | Regular | Captains | Government | Rewards |
|---|---|---|---|---|---|
| 1 | Recruit | x1.0 | x1.0 | x1.0 | x1.0 |
| 2 | Veteran | x1.2 | x1.4 + 2nd mini-ult | x1.2 | x1.3 |
| 3 | Elite | x1.4 | x1.8, more locks | x1.4 | x1.6 |
| 4 | Nightmare | x1.6 | x2.3, extra phase | x1.7 | x2.0 |
| 5 | Legendary | x1.8 | x3.0, extra phase, unavoidable debuffs | x2.0 | x2.5 |

Multipliers apply to HP, damage and accuracy. Party-size scaling is separate (about +60% HP per extra player). Starting values for balance testing.

## 9. Economy, shops and loot

- **Shops** after each captain: gear, gear upgrades, potions, a free small rest, a reroll for gold.
- **Gear** (4 slots: Weapon, Armor, Charm, Trinket; common/rare/epic). Any hero can equip anything.
- **Potions** (4 carry slots, one item action per turn, no word needed): Heal (30/50/100%), Buffs (Focus, Swiftness, Fortune, Ward), Recharge (Elixir of Will: restores ultimate charge), Cleansing Tonic, Phoenix Tonic (revive).
- **Gold and loot:** solo = personal. Party = **shared by default**, with a lobby setting to switch to personal.
- **Shared Fortune:** every reward roll can jackpot (x3 coins, or 3 items). Chance: 5% personal, 20% shared (+0.2% per average party LUK). Pity guarantee after 4 misses in shared mode. Max 3 jackpots per run. Captain/boss drops roll an extra check.
- **Shared spending:** each player can spend their fair share (pool / party size) freely; more needs a majority vote. Gear in the party chest is claimed need/pass with a tie roll weighted toward who has fewer drops. Potions are personal once bought.

### Signature camp features (one per camp visit, not mandatory)
- **Gambler, Offshore Casino:** 5 random prompts in a row, fixed server-side at the start, no restarts (leaving forfeits). Stake gold and unequipped gear/potions. Normal stakes: up to 25% x2.0, 50% x2.25, 75% x2.5, 100% x2.75; a loss costs only the stake. **Extreme Mode** (once per run, last shop only): stake all loot, win x3.5 plus a guaranteed rare+ item and a title, lose everything unequipped; shorter timers and longer words required. Lucky Break (one retry), LUK auto-pass chance, FOC extends timer. Shared mode: only your fair share (vote for more); Extreme only stakes your personal loot. Cap on total casino winnings per run.
- **Ninja, Shadow Path:** skip a regular battle by answering 3 prompts quickly; fail = ambushed.
- **Mastermind, War Room:** before a captain pick 1 of 3 boons (reveal intents, choose weakness, choose the topic of the first 3 prompts).
- **Hero, Sacred Oath:** vow for the next battle; keep it for a party buff and bonus gold, break it for a small party penalty.
- **Villain, Dark Pact:** trade max HP / take a cursed relic for large Power and loot; pacts stack for the act.
- **Hacker, The Vault:** crack a word-puzzle vault (anagram / scrambled letters) for a rare chest; fail raises shop prices at this camp.
- **Mimic, Mirror Hall:** copy an ally's last purchase at 50% power or a shop relic for the act.
- **Thief, The Heist:** steal a shop item free by answering 3 prompts without hitting banned letters; also a post-battle pickpocket round for extra drops; fail = fine and ambush.
- **Parasite, Absorb:** after a captain, absorb one of its abilities as a passive (max 3), each with a small drawback.
- **Oracle, Fortune Tent:** see the next encounter, its intents and shop stock; solve a riddle prompt to pre-reveal the first 3 prompts.
- **Wildcard, Chaos Wheel:** spin for a random boon or rule change; pay to nudge the odds.
- **Jester, The Show:** answer 3 funny prompts for a party morale buff; fail = small debuff to you.

## 10. Progression

- XP per battle: base + bonuses (no one downed, long/rare words, fast turns, combos). Boss kill and full-run bonuses. Co-op bonus per teammate.
- Heroes reach about level 15 across one run (level cap 20).
- Skill points per level; special skills unlock at levels or run milestones.
- Meta-progression per hero profile: unlock pathways, relics, cosmetics and raid levels. A wipe ends the run but keeps XP and unlocks.
- Cosmetic Wardrobe: per hero, 3-4 palettes, 2-3 unlockable outfits, weapon/accessory skins, name/title/portrait frame, a small pathway mark.

## 11. Rules for co-op

- Same prompt for everyone. Duplicate words are allowed with a bonus for unique words.
- Party of 1-4, no duplicate heroes; bots fill empty slots (never a full party's choice).
- Room codes only for launch (no public matchmaking).
- AFK player auto-guards; a disconnected player's pool share stays available.
- Solo gets an extra card slot or a free companion for fairness.
- PvE is behind a feature flag. Separate tables and RPCs; existing regression tests run before every deploy.

## 12. Presentation

Reference: a dark 3D-style mobile RPG battle screen. We build it as **hybrid 2D**:

- **Heroes:** layered puppet / coded vector (animatable, recolourable, cannot drift in style).
- **Enemies and the boss:** painted illustrations with transform animation.
- **Backgrounds:** painted multi-layer scenes with parallax (far, mid, ground, props, foreground, atmosphere), animated ambient effects, lighting tint per stage. Horizon at about 40% height; party front-left, enemies back-right; bottom corners reserved for UI.
- **HUD:** floating HP and shield bars with level badges, numbered turn-order badges, status icons, active-unit ring, a bottom-right skill wheel (portrait in the centre, skills around it with costs), a segmented Power bar, a Skip button, and the prompt/word input panel.
- Landscape-first for battle; portrait fallback for menus and lobby.
- Quality fallback for weak phones (fewer layers and particles). Images in WebP, about 300 KB per layer.

Scenes (alternating bright and moody, fantasy):
1. Sunlit Scriptorium Gardens (bright), 2. Moonlit Standing Stones (moody), 3. Crystal Caverns (bright, vivid), 4. Silent Cathedral of Seals (dark), 5. The Shattered Alphabet Spire (boss, shifts per phase: golden dusk, storm, blood-red). Act 2 and 3 reuse backdrops with lighting variants to control art cost.

Art process: a style bible first, then **one hero, one enemy, one scene** for approval before anything else is generated. Placeholder shapes keep engine work unblocked.

## 13. Technical plan

- New room mode `pve` alongside classic/duel/team: reuse room codes, realtime events, state-version guard, host tick and bot drivers.
- New tables: `runs`, `run_nodes`, `enemy_defs`, `enemy_skills`, `battle_state`, `status_effects` (with `stacks`), `skill_nodes`, `profile_nodes`, `profile_stats`, `class_base_stats`, `stat_caps`, `card_defs`, `items`, `inventory`, `shop_stock`, `casino_sessions`, `upgrades`, `run_relics`.
- New RPCs (all server-authoritative): `start_run`, `get_run_state`, `submit_word`, `lock_action`, `resolve_turn`, `use_item`, `buy`, `upgrade`, `choose_reward`, `enter_casino`, `casino_answer`, `casino_settle`, plus pathway camp RPCs.
- Data-driven effect pipeline shared by players and enemies (skills, debuffs, relics are rows with parameters).
- `_stats()` is the single source of truth for primary stats, substats and breakdowns.
- Seeded RNG for hits, crits, drops and shops, so tests are repeatable and nothing is manipulable.
- Wrapper pattern for engine functions where we extend existing ones; word checker and prompts are reused unchanged.
- Tests: a SQL test per RPC, per formula and per status effect; a bot-simulation balance test (thousands of runs with random builds and every 4-hero combination); Chrome playthrough after each phase.

## 14. Build order and risk control

Vertical slice first, then tiers, always playable:

1. **Phase 1:** `pve` room, one hero, one enemy, the full turn loop (answer, lock-in, resolve), Attack and Guard, placeholder visuals. Gate: is the loop fun?
2. **Style test:** one hero, one enemy, one scene in the hybrid style. Gate: approve the look.
3. **Phase 2:** skills with word gates, debuffs, initiative, hit/miss, ultimates via pathways, 4 slots.
4. **Phase 3:** cards (incl. heals), bot companions, revives, team combo.
5. **Phase 4:** the run (3 enemies + 1 captain + boss first), XP, camp/shop with potions and basic gear.
6. **Phase 5:** all enemies and captains, boss phases and ultimates, raid levels, shared loot, casino.
7. **Phase 6:** skill trees (core trees + first pathways), then remaining pathways and camp features, Wardrobe, story scenes, balance, art, sound, translations, tests.

Tiers: **Must have** (loop, 3 regular enemies, 1 captain, boss, skills, cards, locks/debuffs, battle screen, a basic shop, 5 scenes), **Should have** (XP and trees for the heroes, 4-5 pathways, boss phases, raid levels), **Nice to have** (remaining pathways and camp features, Wardrobe, story scenes, daily run).
Fixed cut order if time runs short: extra pathways, mentor scenes, daily run, extra enemies, Wardrobe. The core loop and the boss are never cut.

Risks: scope (tiers and a feature flag), art consistency (style bible and approval gate), balance (simulations and target win rates), sync and cheating (server-authoritative, seeded), mobile performance (fallback and budgets), breaking the live game (separate tables, flag, regression tests), deploy friction (fix the Vercel permission before it is needed), pacing (test in the vertical slice).

## 15. Open items

1. **Deadline** (decides the cut line).
2. **Hero looks and personalities** (hair, outfit, vibe) for the style bible.
3. Usurper naming is settled (Government is a dragon, son of Economy); confirm he is not also a rider.
4. Phone layout: landscape-first for battle unless you object.
5. Whether to keep the Gambler's Lucky Break and LUK auto-pass as designed after balance testing.
