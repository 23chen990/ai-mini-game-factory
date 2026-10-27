# QA browser no-spend preflight (2026-10-27)

This small change addresses one specific failure observed in the 2026-10-27 capacity evaluation: the blind QA Agent could not access a browser but consumed **100,077 observed tokens**. The experiment did not detect a defect, and its local worktree/report has **not** been imported into this PR.

## Use before any new blind QA attempt

Run `pnpm factory qa-preflight` from the same machine as the game capture. It makes **zero model calls**. It must pass on Chromium and WebKit, with mobile and desktop viewports, and it actually clicks a DOM control, observes the change and captures browser pixels. It exits nonzero on any failure. In `codex-account` mode, `pnpm factory doctor` also performs this functional check; `pnpm factory doctor --qa` forces it in other modes.

Inside `CodexCliProvider.execute`, a metered call at `BLIND_PLAYTEST_QA`, `NATURAL_PLAY_QA`, or `QA` now requires the same browser readiness and records `<label>.qa-browser-preflight.json` before any budget lease or Codex subprocess starts.

### What this DOES NOT prove

- The browser test is on the **host runner**, not within an external Codex Agent session. A reviewer without browser tools still cannot click a game directly. Instead, the authorized host-side Playwright runner must capture a **normal player-input** video/trace, screenshots, timestamped actions and the exact build hash. The independent reviewer can then inspect those artifacts without the browser tool.
- A normal-input capture is separate from hidden game-state simulation or controller fault injection. The reviewer must not see the known fault label, expected diagnosis or controller's judgment before it completes the blind assessment.
- The smoke page is a local fixture, not the game. Passing the preflight is **not** game acceptance, autonomous defect detection, successful repair, or Agent Eval success.
- Missing tool access is `BLOCKED/UNOBSERVED`, not false negative or successful QA. The controller repairing an injected sample is not Fixer success.
- There is no authorization for additional Codex/Research model calls or credits. A token stop based on delayed telemetry is **not** a billing hard cap. Unverified monetary expense must remain unknown.

## Acceptance

Engineering CI must execute the real Chromium/WebKit smoke, plus unit tests proving that an absent browser blocks Codex spawn and leaves a local receipt. The experimental worktree and its uncommitted injection fix still require an authorized local operator to inspect and commit separately; do not invent GitHub evidence for them.
