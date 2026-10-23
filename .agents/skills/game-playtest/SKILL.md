---
name: game-playtest
description: Run deterministic Playwright smoke gameplay against a built web-lite game and emit QA evidence. Use for the factory QA stage.
---

# Game Playtest

本阶段同时验证“工程真值”和“玩家体验真值”。确定性脚本只能证明实现可触发，不能代替自然操作和感知验收。

## Trigger

Use after a successful Web build or after a repair rebuild. Do not perform subjective design expansion, mutate game
source, or pass a run based only on screenshots.

## Inputs and outputs

- Inputs: `workspace/game/dist/`, build report, the Runtime Adapter preview endpoint，以及 blueprint/竞品研究产出的
  failure-pressure contract（失败压力合同）和默认旅程声明。
- Outputs: `artifacts/qa-report.json`（确定性结构 QA）、`artifacts/qa-natural-journey-report.json`（自然旅程
  QA）、`artifacts/perceptual-qa-report.json`（感知/可读性 QA）、`logs/console.log`、
  `screenshots/gameplay.png`。三个报告必须记录各自的证据来源，禁止用一个报告的状态覆盖另一个报告。

## Procedure

1. Start preview on localhost and launch headless Chromium at a fixed viewport.
2. Wait for `__GAME_TEST__`; reset and seed it. Exercise spawn, produce/deliver/reward, grant/upgrade, and inspect state.
3. Confirm a visible Canvas and capture a full-page screenshot. Capture console errors and page exceptions.
4. After the deterministic pass, open a separate fresh browser context and execute the declared default journey using only normal player input (mouse/touch/
   keyboard/gamepad as applicable). Do not use `__GAME_TEST__` setters, debug scenario loaders, state injection,
   fixture teleporting, or internal event dispatch for this pass. Record player-visible evidence for startup → core
   loop → terminal/settlement → replay. If a step cannot be reached naturally, mark it `BLOCKED`, not `PASS`.
5. Review perceptual gates against the failure-pressure contract: the pressure source is visible, escalation is
   legible, feedback is causally attributable to the player's action, recovery/replay is understandable, and any
   physics/collision result is visually natural (including 2D/3D no-penetration, settling, and no tunneling where
   relevant). A fixture-only collision or hidden/internal event is implementation evidence, not player evidence.
   Verify that critical reminders are conveyed by UI/visual affordances rather than tiny helper copy alone, at target
   mobile viewport sizes and in both portrait and landscape orientations.
   For every user-reported visual/physics issue, record a reproduction matrix with object type, lifecycle/state
   branch, renderer/presentation path, and device/viewport. The natural trace and screenshots must exercise the
   exact matrix cell; evidence from a sibling object or fixture does not satisfy the issue.
   For level-based games, also run a level-variety gate: sample early/mid/late levels and record beat timeline,
   pressure-source count/type, authored decision count, natural duration, terminal reward-zone choice, and bonus entry.
   Passing a level because it reaches the finish is insufficient when the contract requires escalating hard obstacles,
   varied cuttable objects, or a risk/reward terminal.
   Also run an orphan-object gate: for each sampled interactive gameplay object (hazard, target, platform, reward,
   trigger, enemy, resource, or hard surface), record whether normal input can touch it, intentionally avoid it, or use
   it for recovery. If the object has no reachable interaction and is not explicitly decorative, mark the level
   `BLOCKED` and route it back to Blueprint/Builder; level completion alone cannot waive it.
6. Always close browser and preview in cleanup. Validate all report JSON before handoff.

## Temporal evidence and bounded natural input

- For an **absence claim** (e.g., missing reward, cue, animation, or collision feedback), a single still screenshot or a missed sampling instant is insufficient. First confirm that normal player input actually triggered the relevant state, then inspect the continuous recording or timestamped frame sequence across the expected response window, including both world-local and HUD overlays. Attempt an independent normal-input reproduction when practical. Bind the claim to input time, observed trigger, viewport, frame range and contradictory frames. If coverage is incomplete or the trigger was not observed, report `UNOBSERVED`/unknown, **not FAIL or PASS**. Never turn a later screenshot into proof that a transient event never occurred.
- Plan natural input **before** the session: compactly execute the intended player actions using real Playwright mouse/touch/keyboard APIs, collect input timestamps and continuous video, and review the evidence afterward. Avoid long Agent/tool think-time gaps between gameplay actions; such idle intervals can cause legitimate failures unrelated to the mechanism under test. Compare intended actions and feedback, not arbitrary fixed tap cadence. Record timing gaps, early falls, skipped branches and elapsed wall time. If the frozen deadline is exceeded or a required journey is not observed, keep the relevant checks BLOCKED instead of treating an exploratory run as accepted.
- Keep independent adjudication separate from the subject's narrative. An independently verified counterexample must invalidate the precise negative claim; do not silently replace the failed claim with a different hypothesis or promote that case to PASS. Preserve the raw claim, counterexample and original timestamps for Agent Eval.

## Acceptance

For a reference preview, first observe one complete reference core slice independently of the candidate's expected
results. Prioritize the relationships producing the loop: target grouping and spacing relative to movement/reach,
reward continuity, and the order of pressure and recovery. Compare the same player intent (for example, cut the
next group and land safely), not merely identical tap intervals. Preserve counterexamples; different art or layout
alone is not a failure. Reuse existing source-bound research and check known gaps/deferrals against the current build;
neither discard them nor promote stale evidence to a current defect.

Then use the exact `behaviorChecks` in `reference-fidelity-contract.json`. Review each object's
declared state at its declared viewport, including causal spatial relationships, feedback attachment and event order.
Record consequential reference observations outside those checks in the existing comparison capture's `observations`
with their own check ids, measured samples and screenshot bindings. They trigger contract review, not an automatic
new gameplay requirement or permission to copy a level. Do not invent a numeric sample when a claim is unmeasured;
retain that evidence gap. The comparison gate must not silently pass by ignoring an unplanned observation.
Write `reference-fidelity-review.json` using `ReferenceFidelityReviewSchema` from `src/schemas/reference-fidelity.ts`.
Record actual observations, the normalized contract hash, current build hash, trace and screenshot file hashes.
Each natural trace uses `NaturalFlowEvidenceSchema`; its transition name identifies the corresponding check id.
Never synthesize a comparison from generic counters or text matches. The control plane verifies identities and
coverage, while the independent reviewer must inspect the actual pixels. Missing or failed comparisons stay BLOCKED.

Deterministic assertions pass, Canvas is visible, no error issue remains, evidence files exist, and
`QaReportSchema.passed` is true only when checks truly passed. The release/product gate is green only when the
deterministic report, natural-journey report, and perceptual report all pass with zero unresolved `BLOCKED` checks.
Builder or Fixer self-reports, unit tests, and fixture traces cannot override an independent natural/perceptual
failure. A repair remains BLOCKED when the exact reproduced object/state branch lacks natural player-visible evidence,
even if another renderer branch passes. Keep infrastructure failures distinct from product failures, but both block
release until resolved.

## Failure

Translate timeouts, browser launch failures, assertion failures, console errors, inability to complete the natural
journey, and perceptual contract violations into explicit QA issues with reproducible evidence. A failed or blocked
natural/perceptual report is valid output for Fixer; infrastructure failure also stops silent release.
