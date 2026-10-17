# 双键飞驰 V4.6 · 试玩难度反馈 / 施工验收记录 (2026-10-17)

- Game / workspace: `qq-speed`; generated runtime `runs/h5-qq-mobile-20261013/workspace`; tracked source `templates/web-lite/h5-source-mobile-v1/racing`.
- Observed: user naturally played the phone racer and reports both courses and competitors are still too easy. No timestamped phone recording, measured human lap, device/browser, or exact playing URL was supplied.
- Classification: CORE_LOOP / difficulty + version/provenance; formal QA→FIX route, not a superficial visual skin bug.
- Branch chain: joystick PR #30 head `4f201f4` based on PR #26 `9fa066a`; stronger V4.2 native AI PR #23 `e8dde6a` is a *separate descendant*, not automatically inherited by the joystick version. Legacy raw.githack preview is independently published and cannot prove its source version by appearance alone.
- Reproduction matrix: 02/05 desert × started race × native Track/3D renderer × landscape phone; 07/11 coast × started race × native Track/3D renderer × landscape phone; opponent follow / lead / corner exit × career versus menu/demo × native AICar frame; final wheel input × normal, drift, countersteer × Chromium simulated touch / iOS / Android. Last two physical platforms NOT_RUN.
- Hypothesis: career AI field lacks fixed V4.2 varied pace and game-native rubber() weakens leaders. 02/05 and 07/11 retain broad roads and too few higher-risk physical line choices. A changed lobby route preview alone is not evidence.

## Acceptance, without weakening CI
1. PR #30 analogue wheel/active drift/nitro controls survive unchanged, legacy two-button mode does not reappear, old saves stay compatible.
2. Stage 01 stays introductory. Later stages use a pre-race fixed field based on actual AICar skill, no catch-up teleport/forced collision/result edits or player-dependent speed. Native `rubber()` no longer reduces career rivals' pace.
3. Stages 02/05/07/11 change *physical* 3D Track centerline/road collision width, with no spline self-intersection, protected shortcuts or unreachable pads; same native physics and item objectives.
4. Tests: targeted Node assertions, true build, lint/typecheck, fixed-seed native AI pace / geometry audit, Chromium WebGL wheel touch / stage id / map load from the exact HEAD. Don't substitute old green CI.
5. Independent real mobile blind-play: first three attempts on 02/05 and one full 07/11 race; capture source revision, human failure/win and reason, perceived line choice, whether a novice can finish 02 and proficient player must respond to the leader in 05/11. Human challenge and joy NOT_RUN until actually observed.

**Release:** QA-only Draft. Real device, lived game experience, TapTap LIVE ads, rights archive, and any public launch are not verified.
