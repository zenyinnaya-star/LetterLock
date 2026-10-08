# Cinematic combat spec — status and realistic roadmap

The attached 85-section spec (two versions) is a full game-design bible: combat
systems, 12-class identity, party synergy/relationships, 7 world regions with
towns/NPCs/dungeons, a central story, crafting, a guild, difficulty modes,
New Game+, a roguelike "Infinite" mode, and multiplayer word-fusion/raids. That
is many months of work (most of it writing, art and level design, not just
code) and can't be built in one pass. This file tracks what's real, what's
flavour, and what's next, so nothing gets claimed as done that isn't.

## Built and live on `main`
- **Combat event bus** (`lib/combat/events.ts`) — every resolved log entry becomes
  typed events (WORD_CORRECT, CRITICAL_HIT, WEAKNESS_HIT, BREAK_TRIGGERED, ULTIMATE_*…).
- **Animation registry** (`lib/combat/registry.ts`) — per-state frames with fallback
  chain and priority; preloads only the current encounter.
- **CameraDirector** (`lib/combat/camera.ts`) — swing/heavy/critical/break/ultimate/
  intro presets, eased, reduced-motion aware, per-hero amplitude/tempo.
- **WordScore + rank** (`lib/combat/score.ts`) — FAIL→PERFECT tiers, D–SS ranks.
- **Break meter** — visual only (see "Not real" below), per-enemy toughness.
- **Combo counter**.
- **Letter VFX** (`components/LetterVfx.tsx`) — the typed word becomes the effect
  (pop/orbit/streak/fill/shatter).
- **Battle intro** — normal/elite/boss cinematics with enemy title cards.
- **Per-hero combat identity** (`lib/combat/profiles.ts`) — for all 5 existing heroes:
  letter colour, camera feel, ultimate title, and now a real **class word mechanic**
  that nudges WordScore itself (Shiro: short words, Nero: long words, Kira: rare
  letters, Mira: weakness hits, Prince: crit+weakness) with a one-line flavour tag
  shown in the result label (e.g. "JACKPOT", "BULWARK").

## Not real yet (visual/flavour only, needs a server change to matter)
- **Break** doesn't skip the enemy's turn or multiply damage yet — that's resolved
  server-side in Supabase RPCs, so it needs a migration, not just client code.
- **Combo** doesn't grant real crit chance / Ultimate charge / team-attack unlocks —
  same reason.
- **Class word mechanics** only nudge the *displayed* score/rank, not actual server
  damage — the server doesn't know about classes beyond the hero's existing stats.
- **Answer speed** isn't scored at all — the Book of Wisdom doesn't report how long
  the player took to answer.

## Out of scope for now (would need their own project, not a combat patch)
World regions/towns/NPCs, dialogue/relationship system, Wordbook, crafting/
equipment evolution, guild ranks, environmental word-locks, difficulty modes,
New Game+, Infinite/roguelike mode, multiplayer Word Fusion/raids/duels. These
are real, good ideas, but each is a separate design-and-build effort on top of
a database schema that doesn't have the tables for them yet.

## Suggested next concrete step
Make Break and Combo *real*: a server migration so a broken enemy actually
skips/weakens its next action and damage gets a real multiplier, and combo
streaks grant real crit-chance/Ultimate-charge bonuses. That's the one change
that would make everything built so far stop being decoration.
