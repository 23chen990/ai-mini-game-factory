---
name: game-playtest
description: Run deterministic and normal-input Playwright gameplay against a built web-lite game and emit profile-appropriate QA evidence. Use for the factory QA stage; not a substitute for independent human enjoyment testing.
---

# Game Playtest

工程正确、画面可理解、真人是否喜欢是不同证据。脚本正常输入也不是未经指导的真人试玩。

## Trigger

Use after a successful Web build or a repair rebuild. Do not expand the design, mutate game source,
or pass a run based only on screenshots. Read the approved primary experience profile and frozen contract.

## Inputs and outputs

- Inputs: `workspace/game/dist/`, build report, Runtime Adapter preview endpoint, reference/experience contract,
  declared renderer and normal journey, and a gameplay work order when one was approved.
- Outputs: existing `artifacts/qa-report.json`, `artifacts/qa-natural-journey-report.json`,
  `artifacts/perceptual-qa-report.json`, console logs and screenshots. Keep their provenance separate.
- New work-order case tags complement the existing Zod contracts; they do not silently modify old frozen schemas.

## Procedure

1. Start the owned preview and a fresh browser at declared mobile viewports. Register cleanup before actions.
2. In a SEPARATE deterministic fixture context, use only the adapter's actual declared test API.
   `__GAME_TEST__` is not universal. A shop may exercise spawn, produce/deliver/reward and upgrade;
   an action game tests input/physics and recovery; a story tests facts/choices/consequences;
   a puzzle tests rule transitions and its declared solvability/randomness. Missing adapters are explicit gaps,
   not permission to call invented hooks, inject a PASS state, or run management checks on every game.
3. Verify the DECLARED renderer is visibly working: Canvas/WebGL for those runtimes, or DOM/text/controls
   for narrative and other DOM-based games. Do not require Canvas universally. Capture errors and screenshots.
4. Open another fresh context for the default journey using only normal player inputs. No fixture loaders,
   debug setters, teleporting, internal event dispatch or hidden test-target instructions in that trace.
   Record startup -> core decision -> visible consequence -> appropriate ending/recovery/continuation.
   Finite stories can end or continue a chapter; they need not fake a death screen or mandatory replay.
   Every step REQUIRED BY THE FROZEN CONTRACT must remain required. If unreachable, mark BLOCKED.
5. Select applicable profile checks from the approved work order or `gameplay-loop-review/references/profiles.json`:
   - ACTION_FEEL: input response, visible loss cause and learned retry. Use target-device timing assumptions explicitly.
   - STRATEGIC_SYSTEM: same incoming demand, different allocations; resource opportunity cost and visible progression.
     An idle game need not create anxiety or timed punishment to pass.
   - NARRATIVE_AGENCY: meaningful consequences, knowledge/relationship continuity and next-scene or ending value.
     Reconverging branches are valid when declared differences are real.
   - PUZZLE_CLARITY: understandable rules, appropriate solvability/randomness evidence, and explainable failure/retry.
   Test at most one approved secondary profile and its cross-system interaction, not every specialist track.
6. For applicable failure pressure, verify its source, escalation, attribution and recovery are visible. Test physical
   overlap/settling/tunneling only where physics exists. Critical signals cannot depend solely on tiny helper text.
   Preserve the object x state x renderer x viewport reproduction matrix and test the exact reported branch.
7. For approved content expansion, sample early/mid/late levels or chapters under their contract; verify variation,
   decision impact and all reachable required objects. First-slice tests do not pretend later content was tested.
   If an object has no reachable interaction and is not decorative, record BLOCKED. Story nodes use state reachability.
8. Close browser and preview in finally/cleanup, validate existing report JSON, and attach source/build/contract hashes.

## Acceptance

For a reference preview, use exact `behaviorChecks` from `reference-fidelity-contract.json` at declared viewports.
Write `reference-fidelity-review.json` with `ReferenceFidelityReviewSchema`; retain actual observations, contract/build
hashes, trace and screenshot hashes. Each natural trace uses `NaturalFlowEvidenceSchema` and the corresponding check id.
Never synthesize comparisons from generic counters or text matches. Review actual pixels and relevant text/controls.

The declared renderer is visible, deterministic and natural/perceptual assertions pass, all required evidence exists,
and `QaReportSchema.passed` reflects those actual tests. Missing/failed required cases stay BLOCKED.
A sibling branch, fixture trace or Builder self-report cannot close a reproduced user problem.
Infrastructure failures and product failures remain distinct; neither silently allows release.

Do not report enjoyment, voluntary retry, next-day return or retrospective value from these tests. Human review and
real commercial measurement are separate; an AI actor completing a scripted journey is not a human participant.

## Failure

Record reproducible issues for timeouts, missing adapter/renderer capabilities, assertion failures, console errors,
unreachable required journeys or perceptual failures. Preserve evidence and the smallest causally linked change request.
Do not lower a frozen threshold, add unrelated systems, or confuse a generated case specification with an executed test.

## Mobile pacing regression: enforce intent through actual behaviour

Read the declared `experience` mode and `gameplay-loop-review/references/mobile-pacing.md`.
For active dispatch, test zero input, each single action at multiple timings, fixed roles and adaptive play.
Check real early demand, warning before loss, recovery and the next decision after relief. A global timer,
a successful optimized policy or a throughput improvement alone does not establish urgency.

Use the default speed for the whole first session and record wall time. Faster runs remain useful engineering
checks but cannot satisfy default-speed experience. Act on visible scene objects or the declared primary input;
a pre-written selector journey only proves it can execute, not that a stranger discovers the controls.
Check portrait reflow or explicitly declared rotate handling, touch cancellation and room-scoped actions.
A 44-pixel button and no overflow do not establish a mobile interaction model.

Keep a reproduced user failure open until its exact branch has new evidence. Do not clear it merely because
old tests or known-regression repair exercises are green. Report engineering, scripted experience, independent
model review and human sessions separately. Missing subjective review is not proof of an approved product.
