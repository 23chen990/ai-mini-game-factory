# CF V18 — Mobile Lite Internal Release Candidate

> **Private human playtest only. Not approved for commercial publishing.**
> Source: `cf-transport-ship`, run `h5-cf-challenges-20261013`, Draft PR #64.

## Product contract

- Landscape iPhone/Android browser FPS: left thumb walks, right thumb looks, hold FIRE and drag to shoot while tracking.
- Native Three.js original hitboxes, collision, ammunition, weapons, enemy AI and actual kill counter.
- Mobile-specific manual-fire rules throughout: no automatic firing, no idle camera aiming, and no actor/HP/kill teleport for victories.
- One short, visible goal per match. Genuine personal elimination, capture and extraction; no mandatory hidden walking-distance drill.
- Progressive native actor budget: start with genuine **1v1** in mission 01, then 2v2–4v4; enemy difficulty profiles change native AI reaction/track/strafe, **not** bullets or damage.
- Saved challenge IDs, mastery, controls and anonymous local reports continue using the existing versioned keys. Other games untouched.
- Eight missions, two optimized real collision maps. The first four share the authored ship, the final four use original depot geometry. They intentionally vary objectives/enemy pressure, **not** eight unique maps.
- Original team victory target is disabled for V18 lite matches; only actual goal completion, legitimate death budget and visible mission timeout settle the game.

## Mission matrix

| ID | Display name | Human-readable objective | Distinguishing combat |
| --- | --- | --- | --- |
| tags | 01 · 货箱破门 | Own 2 authentic M4A1 kills | Immediate visible enemy, follow-up fight |
| precision | 02 · 远点狙击 | Own 1 authentic AWM kill | Scope and choose a clear line of sight |
| survive | 03 · 围攻生存 | Survive full 45s, own 1 kill | Increasing flank pressure |
| defense | 04 · 港口守点 | Hold A for 7s, uncontested | Enemy native NavGrid contest |
| assault | 05 · 仓库突破 | Reach authored approach point then own 2 kills | Route to checkpoint and genuine defenders |
| marksman | 06 · 通道狙击 | Own 2 AWM kills | Depot long lanes / moving aim |
| evac | 07 · 装卸区撤离 | Own 1 kill, hold extraction 5s | Enemy contests extraction; immediate success when completed |
| counter | 08 · 逆线夺点 | Hold remote B for 7s | Reverse-site rush and contest |

Elite objectives may be higher; retained as optional earned replay.

## H5 microgame constraints (not a desktop FPS)

- **One HTTPS link, one START tap, no install, no account**. Landscape web only.
- **First 3 seconds must show an LOS-confirmed real enemy** in a real map lane; a container wall is a test failure. The opening camera only chooses an authored safe bearing once before combat; it never auto-locks or tracks mid-match.
- **Real first kill within 30 seconds**, using only physical-look/press/touch-like input and original bullets. Short failure → instant free retry.
- **Bite-size matches:** normal missions use 45-85 second limits (survival remains a full 45 seconds). The mission needs one visible win condition and immediately exits on actual completion, not a mandatory idle timer.
- Minimal handheld loop: left stick, free right look, FIRE-drag, contextual jump/reload. No PC menus, keyboard hints, scoreboards or mandatory tactics popups.
- **Web budget is a release test, not an assumption:** measure first playable frame over throttled mobile data, WebGL device loss recovery, phone thermal/FPS and memory. Don't claim a byte budget, 60fps, instant replay or phone compatibility without evidence.
- First live frame should reserve clear forward geometry; opening lane is picked using bounded native wall-ray and walkability tests, with an early return for a safe camera-facing lane.
- Before shipping to TapTap or a commercial host, check source and asset redistribution permissions, platform ad API proof, Safari/WebKit and Android Chrome touch behavior.

## Critical verification gates

1. Node unit/regression suite, lint, types, browser integration and actual original Three.js build.
2. Real landscape touch input from CDP: both directions and reversible yaw, no ghost mouse shots, walk/fire simultaneously, jump, reload, safe cancel, pause and orientation.
3. Genuine first native personal kill in the first 30 seconds with **visual right-thumb swipes**, zero auto fire, and a kill-cue event driven by the native counter.
4. Independent no-attack native enemy bullets and real player HP loss; no test injection of HP, actor positions, clock, kills or result.
5. Eight-mode original 3D startup/weapon/fire smoke, real full 45s terminal and genuine no-ad retry. **Eight full natural victories are a further release gate and are NOT proven by smoke.**
6. Check 667×375 and wider/taller landscape safe areas for buttons and all text overlays. Test at least one physical iPhone Safari and Android Chrome, preferably 10-15 rounds each.
7. For hands-on sessions: record whether a non-expert understands their first objective in 5s; earns a real first kill within 30s; distinguishes enemy versus allies; can reverse a camera sweep immediately; can explain a failure; and chooses free retry or genuine reward-ad revive without pressure.

## Delivery / where to obtain a playable build

1. Open Draft PR #64 and its **Lean pilot verification** GitHub Actions run.
2. The CF native test job is `cf-v14-first30-native-3d`, extended to V18; once **green**, download the matching `cf-v14-first30-internal-<sha>` artifact.
3. Unzip the nested internal-playtest ZIP. Open its `index.html` in a supported local HTTP server or controlled private hosting, then use landscape mode. Only hashes/screenshots from the **same head SHA** are valid for acceptance.
4. Do not use a stale ZIP from an earlier V14/V17 SHA as V18 evidence.

## Remaining hard blockers — do NOT silently call this a public release

- Upstream `riba2534/claude-opus-5-5-demo` root and CF subtree at pinned commit `54adc1f...` have no explicit license file and repository license metadata is null; permission for commercial redistribution (including recognizable CF branding) is **NOT VERIFIED**. Three.js's separate license does not settle rights to the original game.
- Physical Safari and Android Chrome frame pacing, thermals, touch, safe-area and audio are NOT RUN.
- No independent human playtests, D1 retention, rewarded-video provider acceptance receipts or revenue claims.
- Eight **natural** completed victories and genuine user frustration/retry interest are not yet independently demonstrated; native startup smoke is not equivalent.
- Keep PR in Draft; never merge or publish while blockers remain.

## Acceptance labels

- `CODE_READY`: focused implementation and unit/CI regressions pass.
- `INTERNAL_PLAYTEST_RC`: exact-HEAD original 3D smoke and a full natural failure/free retry pass; private demo may be shared for human feedback.
- `PUBLIC_RELEASE_READY`: licensing, actual-device runs, 8-mode natural completions and compliant advertising integration all complete.
