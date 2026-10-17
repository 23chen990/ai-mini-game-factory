# CF H5 — V19 Solo PvE Microgame Direction (2026-10-18)

Status: DESIGN LOCK FOR INTERNAL PLAYTEST. Never confuse with production certification.
Built onto V18 Draft #64; retain genuine native Three.js first-person weapons,
map collision, ray LOS, damage, reload, enemy Bot AI, and manual thumb aiming.

## Product definition: one hero, enemy-only short assaults

This is a mobile landscape **single-player H5 mini game** — not a deathmatch
against fake teams, a squad-management simulator, a console FPS, a rail shooter,
or an endless grinding App.

Each 30–80s fight follows **see threat → choose angle → fire → react or move → win/
fail → immediate next/free replay**. No matchmaking, no registration, no idle lobby.
A mission always names ONE outcome the player understands by looking at the world.
Only the human's own native kills or native survival/capture conditions win.

## Implementation rules

1. Native engine creates actors using its pinned team-oriented factory. On every
   H5 lite start and warm replay, immediately remove ALL same-team nonplayer Bots
   from the authoritative game.actors and Three.js scene before the first frame.
   Remove their associated team tags. No AI allies can damage enemies, divert
   enemy pressure, soak bullets, or respawn. Never grant scripted kills/damage.
2. 01 begins as **1 human vs 1 genuine Bot**. Stage enemy counts increase
   independently (1, 2, 3, 3, 3, 2, 3, 4), not as 1v1, 2v2, 3v3 teams.
   Keep concurrency <=4 Bots for low mobile WebGL cost.
3. Enemy behaviors come from the original visible, LOS-based AI (hold, rush,
   flank), mapped to different geometry decisions and objectives. Avoid purely
   increasing health, invincible enemies, teleport spawns, or cheating aim.
4. Every first screen must provide a walkable, head AND torso line of fire to
   the target in original geometry. The camera may choose a good authored
   starting facing once; never follow a living actor without user movement.
5. On-screen mobile controls: left stick walks, right thumb looks, holding FIRE
   shoots and drags aim; contextual jump/reload/scope only when useful. No
   teammate icons, team scores, rank list, confusing weapon and training stats.
6. All results are sourced from real player's gunshots and enemy actions.
   Prompt next/free replay immediately on genuine completion/failure. Rewarded
   video optional only when an actual SDK reports reward (never the only route).

## Eight small encounters (same TWO original collision maps)

| # | Area | Threat | Objective | Key player decision | Target session |
|---|---|---|---|---|---|
| 01 | Ship cargo entry | 1 sentry | Own **one** real rifle kill | Shoot in direct LOS, shift angle only if necessary | 15–40s |
| 02 | Ship sniper lane | 2 guards | Own one AWM kill | Pick a clear angle and scope | 30–60s |
| 03 | Ship flank zone | 3 Bots | Survive 45s, own one kill | Stay behind cover versus approaching enemies | 45s |
| 04 | Ship entry defense | 3 Bots | Hold one site 7s | Defeat or evade contesting enemies | 30–60s |
| 05 | Depot warehouse | 3 Bots | Reach checkpoint, own 2 kills | Move under fire, clear defender | 35–70s |
| 06 | Depot long lane | 2 Bots | Own 2 AWM kills | Reacquire after bolt cycling | 40–75s |
| 07 | Depot exit | 3 Bots | Own 1 kill, hold extraction 5s | Decide when to break cover and leave | 35–75s |
| 08 | Depot reverse capture | 4 Bots | Capture B for 7s | Push past a real flanking and contest threat | 45–80s |

Actual current limits are safety caps, not promises of completion time; real device
playtest must check average duration, target legibility and genuine losses.
Advanced repeat challenges may add ONE Bot up to 4, but are not required for
the short IAA loop.

## Failure, revival and monetization boundaries

- First level gives a fair 3-second observation window; it still demands
  natural shots. A genuine enemy can return fire and hit the player.
- Dying must stop held fire/jump to avoid ghost input on native respawn.
- Free replay is always present; optional revive is a choice, never a forced ad.
- Do NOT tie progression to watch-time, duplicate levels, fake stars, login
  streaks, persistent currencies or weapon gacha.
- No claim that players will watch ads, or that the IAA loop earns money,
  without observation of real retry and rewarded-completion funnels.

## Acceptance before calling this a playable candidate

- Unit tests: no friends in g.actors, no friend scene mesh/tags, 8 distinct
  enemy counts, old non-lite mode unchanged, true native scoring.
- Exact-SHA native Three.js CDP touch QA: zero friendly Bots in each mission,
  one player, correct live enemy counts, LOS-backed first screen, first genuine
  rifle hit and native personal kill within 30s, enemy actual shots and player
  HP loss in an untouched no-attack branch, 45s survival, native free replay.
- Browser regression checks and physical iPhone Safari/Android Chrome.
- Still **not publicly licensable** until permission for pinned upstream
  source/assets and franchise-similar branding is verified.
- Only 2 map geometries: an eight-mission mode does not mean eight unique
  arenas. Deep map/encounter diversity remains a later design task.

Comparable mobile solo shooter ideas: Major Mayhem 2 (fast short firefights
and reaction windows) and Cover Fire (single-player battle objectives). We
are not copying their art, IP, aiming system or monetization.
