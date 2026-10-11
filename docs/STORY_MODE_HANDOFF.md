# Letterlock Story Mode — playtest findings + fix plan (handoff for Opus 5.5)

Written 2026-10-11 by Claude (Sonnet 5.5) after a live playtest of https://letterlock-theta.vercel.app in the owner's Chrome
(viewport was small, ~501x350, so this is mostly a **phone / short-landscape** pass) plus code and SQL review.
Repo: https://github.com/zenyinnaya-star/LetterLock (`main`). Read `docs/ROADMAP.md` too. Owner: Zabdiel (terse, voice-dictated).

## 0. Rules you must follow
- Priority order set by the owner: **1) stability + gameplay logic, 2) UI matches the reference, 3) art polish last.**
- Reference image: `docs/reference/battle-reference.png` (Harbor Ruins battle). Current-state screenshot: `docs/reference/battle-before-2026-10-11.png`. Match the reference 1:1 in structure.
- Higgsfield spend: confirm the cost with `get_cost` first, **ask the owner to type "go" in chat**, cap total <= 200 credits, keep a 20-30% reserve (balance was 268.06 on 2026-10-11, plan = Starter). Do not work around a blocked spend.
- You cannot see Higgsfield images from the sandbox (CDN is blocked) — never claim visual verification; ask the owner to look.
- Remove AGENTS.md / CLAUDE.md before every commit. Supabase harness cancels DROP (use rename/revoke/create or replace).
- Commit trailers: `Co-Authored-By: Claude <noreply@anthropic.com>`; push to `main`. The owner redeploys Vercel by hand (Vercel MCP deploy is 403).
- Server is authoritative (Supabase security-definer plpgsql). Never trust the client for outcomes.

## 1. What the reference shows (target)
Top bar: logo with a **padlock as the "O"** + "Harbor Ruins · Round N"; **turn-order strip** of ~8 portraits with ">" chevrons, current actor framed gold with a pointer under it; centre hexagon plate **"YOUR TURN / You can act now"**; right panel **"MULTIPLAYER 2/3 Ready · Waiting for: Kira"**.
Stage: one painted full scene (moon, gothic castle, ship, torches, stone quay). **Left party cards** over the scene (portrait ~70px, `HP 84/100`, `MP 20/30`, gold arrow on the active hero). Heroes on the quay at left, gold ring under the active hero. Enemies on the right at different depths with nameplates: **diamond portrait + name + red bar + `HP 220/300`**; red diamond marker on the ground under the targeted enemy. Heroes are tall, side-on, weapon visible; enemies are distinct (Dread Knight, Shadow Hounds).
Deck (4 panels): command list (Attack, Skills, Guard, Book of Wisdom, Item + hint line) | detail (title, Power/Cost/Target row, "Select a target", **portrait chips**, **A Confirm / B Cancel**) | Party Status (portrait, name, HP + MP bars, status badges) | Combat Log (icon lines, `< Round 2 >`).

## 2. Playtest log (live site, solo story, Shiro) — what works
- Story entry: /play -> Story -> hero select -> room lobby -> BEGIN -> act title card (new Harbor art looks right) -> battle.
- Tutorial tip appears; Skip works. Attack -> pick enemy -> Confirm: hero attacks, enemy dies, **enemies then act (hero 64 -> 57) and the turn returns** — the "enemies not attacking" fix (48e164f) is confirmed live.
- Stage 1 (3x Intern Auditor) cleared; stage 2 (Clerk, The Collector, Clerk) starts automatically with HP restored to 64/64 (no camp between 1 and 2 — check against design; ROADMAP says camp exists).
- "No timer" shows in solo.

## 3. Defects found (fix in this order)
### A. Stability / logic / flow
1. **No auto-target after a kill**: after an enemy dies the Confirm button stays disabled with no hint until you click a new enemy. Auto-select the next living enemy (or show "Select a target").
2. Story result screen returned empty in an earlier SQL test of `story result` — re-test the win/lose/result RPC end to end (`get_battle` step 'won'/'lost', XP, rewards) and make sure the UI renders it.
3. Stage 1 -> stage 2 transition has no camp/rest beat and fully heals; confirm intended flow (5 stages, camp step 'camp', boss on stage 5) and add a short "Stage cleared" interstitial so it does not feel like a glitch.
4. Multiplayer (2-4 humans) has never been tested live: two browsers, ready-up, "Waiting for: <name>" text, 90 s idle safety net (migration 072), AFK counting. Build a Playwright script for it.
5. No automated tests exist. Add Vitest for engine RPC wrappers + a Playwright solo run (lobby -> stage 1 -> kill -> stage 2). The earlier local Playwright harness hung on the Bash classifier — keep runs short.
6. Cast Word overlap: fixed in a2d2bae (children of `.bx-detail` no longer shrink). Verify in browser with a target selected.
7. Game design gaps: ultimates do not fill Break; Book of Wisdom has no combat effect; no enemy "next move/weakness" shown on the target chip (`weak fire` text exists in chips — good, surface it on the nameplate too); no MP resource (reference has MP; either add real MP or relabel ULT bar as the third bar).

### B. Visual / layout
1. **Enemy name overlaps its HP label** ("AUDITOR" + "HP" collide) in the compact layouts (<=760px and short landscape). See `.rg-uname` / `.rg-uc-hp` rules at the end of `app/globals.css`.
2. **Single enemy is clipped at the right edge** on narrow screens (`ePos` n===1 -> left 72%). Clamp positions to the stage with a margin.
3. **Deck is below the fold at short heights** and the lobby hero art bleeds behind the deck: the full-bleed `.shell.rpg` is not covering the viewport on short screens. Make the battle shell a fixed full-viewport flex column (top bar / stage flex:1 / deck fixed height) at all sizes.
4. **Ground/dock**: no ground element existed before 1dd0a04 (the dock was assumed to be painted in the backdrop). The current `.rg-ground` is a translucent dark band with hard edges and characters sometimes stand over water (backdrop crop shifts with aspect). Decide: either (a) re-anchor the whole stage to the backdrop (compute feet line from the art, use `background-size: cover` + a fixed focal point and place units relative to the art's dock) or (b) keep a painted ground plate (`hf_20261011_201447_34c7f5be…png`, stone quay, generated 2026-10-11, owner has NOT yet approved how it looks). Feet land between ~75-91% of stage height; rings anchor at 78% of the unit box.
5. Stage backdrop crop: the stage is very wide and short (5:1 on 1908x847) so the harbor skyline can be cropped away (earlier screenshot showed only paving). Reference stage is ~2.4:1. Give the stage a minimum aspect (e.g. >= 2:1) and shrink the deck, or letterbox with the top of the art pinned.
6. **Tutorial tooltip covers the top bar / turn pill** at small sizes — dock it above the deck instead.
7. Lobby on phone: hero name overlaps the sprite, "INVITE TO PARTY" labels clipped, top tab "INVITE" cut off, reaction bubble overlaps the invite slots.
8. /play first screen shows only the title and a dark empty block before the mode cards (cards sit below the fold) — tighten.
9. Missing from the reference: left party cards (added in f2450f9, unverified), padlock "O" logo, 8-portrait turn strip with chevrons, MP bars, status badge icons, A/B button glyphs on Confirm/Cancel, portrait diamond on nameplates.
10. Hurt pose for Shiro is still back-facing (his side sprite is used for every other pose).

### C. Animation
1. Only Shiro has a side-view sprite; every other hero uses back/front art so the lineup looks inconsistent.
2. `SHEETS['Shiro:IDLE']` hook exists (`components/SheetSprite.tsx`, `lib/combat/registry.ts`) but no sheet is registered. AutoSprite is NOT available through the Higgsfield MCP (`generate_image` -> "Job set type not supported"; cost check errors); the owner could not find it on the site either. Idle is a still image; the owner prefers still over jiggle.
3. Attack lunge / hurt flash use `motion/react` keyframes; verify timing against the speed-ordered log playback (`_roll_turn` playback seconds).
4. All enemies of a type share one sprite; the 3 Intern Auditors are tinted copies of the same art (reads as a clone of Shiro in the earlier screenshot).

## 4. Higgsfield plan (what to generate, in order; all need owner "go")
Plan type Starter: Seedance 2.5 is blocked (needs Plus). Kling 3.0 and MiniMax H3 image-to-video both quoted **10 credits / 5 s**. `gpt_image_2_5` low quality ~0.25 credit per image.
| # | Asset | Tool | Est. cost | Notes |
|---|---|---|---|---|
| 1 | Nero + Kira fresh portraits (match Shiro's approved one `…184324_05a5dc5e…`) | gpt_image_2_5, image_references, medium | ~1 | owner types "go" first |
| 2 | Review Mira + Prince portraits already generated (jobs 60d79808…, bce01945…) | — | 0 | owner approves look before wiring |
| 3 | Side-view sprites (transparent bg) for Nero, Kira, Mira, Prince, same style/scale as Shiro's `…053202_832e01db…` | gpt_image_2_5 | ~2-4 | needed for the left-facing lineup |
| 4 | Distinct enemy sprites: Intern Auditor, Clerk, Collector, Bailiff, Commissioner, Tax Drone; Dread Knight + Shadow Hound exist but the owner said "don't wire" — ask | gpt_image_2_5 | ~3-6 | keep Government boss art |
| 5 | Enemy nameplate diamond portraits (crops of #4) | code crop, 0 | 0 | do in CSS, no generation |
| 6 | Ground plate decision (see B4) | gpt_image_2_5 | ~0.25 each | only if owner rejects current plate |
| 7 | Act intro clips (Harbor Reveal first) from `media_id e7547492…` (the Harbor backdrop) | kling3_0 or minimax_h3, 5 s, 16:9, no audio | 10 each | owner has not said "go"; keep optional, host the mp4 and add a play-once intro with a skip button |
| 8 | Idle sprite sheets | blocked (AutoSprite unavailable) | — | revisit if the owner finds the tool |
Total if everything is approved: roughly 30-45 credits; stay well under the 200 cap.

## 5. Suggested work order for the fixing session
1. Stability: B3 (full-viewport battle shell), A1 (auto-target), A2/A3 (result + stage transition), then write tests (A4/A5).
2. Layout to the reference: B1, B2, B4, B5, B6, B9 (turn strip, nameplates, MP/third bar, glyphs, padlock logo).
3. Art: Higgsfield items 1-4, then wire in `lib/heroes.ts` (HERO_PORTRAIT), `components/Battle.tsx` (`HERO_SIDE`, `sprite()`), `lib/art.ts` (ENEMY_*).
4. After each push: ask the owner to redeploy and send a screenshot next to the reference; compare, then continue.

## 6. Key code map
- `components/Game.tsx`: when `phase === 'battle'` renders `<div className="shell rpg">`.
- `components/Battle.tsx`: stage + units (`ePos`, `hPos`, `Sprite`, `StageBg`, `HERO_SIDE`); `components/BattleHud.tsx`: TopBar + CommandDeck (CSS `.bx-*`); stage CSS `.rg-*`; all in `app/globals.css` (appended blocks, later rules win).
- Engine: `supabase/migrations/042-072`; `_roll_turn` (072), `battle_submit/battle_step/_battle_resolve`, `get_battle`.
