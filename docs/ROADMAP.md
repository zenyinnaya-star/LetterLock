# Letterlock Story — Roadmap

Handoff doc: start each new session by reading this file, not the whole codebase.

## Where we are (2026-10-07)
- Story PvE: server-authoritative battles (Supabase RPCs, migrations 042–047), camp/shop/casino/pathways, XP/levels/stats, skill tree (client-only), enemy AI.
- 3D stage: `components/Stage3D.tsx` (three.js + @react-three/fiber), test page `/demo3d`, `?2d` fallback.
- P5-style banners/bursts in `components/Battle.tsx` + `app/globals.css` (`.rg-ban`, `.rg-burst`).
- Higgsfield prototype (standalone, throwaway): https://letterlock-story.higgsfield.app

## Phases (each = one fresh session)
| # | Phase | Done when | Key files |
|---|---|---|---|
| 0 | Stabilize: redeploy Vercel, one real playthrough, fix what breaks | Act I → camp → boss → stats works live | Battle.tsx, Camp.tsx |
| 1 | Elements + weaknesses (prompt theme → element; enemy weak/resist; WEAKNESS! pop) | Server test + UI shows icons | new migration 048, Battle.tsx |
| 2 | Momentum 0–100 (atk +10, weak +20, crit +25, guard +5, miss −10) → Limit Break | Meter fills, finisher fires once at 100 | migration 049, Battle.tsx, Stage3D.tsx |
| 3 | Cinematic camera (frame attacker/target, follow, impact punch-in, return) | Visible in /demo3d | Stage3D.tsx (Rig) |
| 4 | Commands: Skills submenu + Items | Usable in battle | Battle.tsx, migration 050 |
| 5 | Multiplayer: Realtime push, shared playback cue, AFK auto-guard, party scaling, ready-up | 2–4 clients stay in sync | lib/rpc.ts, Battle.tsx, migration 051 |
| 6 | Multi-client scripted test + balance pass | Full run with 3 simulated players | scripts/, SQL tests |
| 7 | Optional Higgsfield: 1 finisher clip + SFX (quote first; 11.25 credits left) | — | lib/art.ts |

## Rules for cheap sessions
- Read this file + only the files in the phase row. Use grep/line ranges, not whole-file reads (Battle.tsx is big).
- DB tests: `do $$ … raise exception … $$` via execute_sql (auto-rollback).
- Commit + push at the end of every phase; update the table above.
