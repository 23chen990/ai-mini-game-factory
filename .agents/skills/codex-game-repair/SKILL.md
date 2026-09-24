---
name: codex-game-repair
description: Continue the Builder Codex thread to repair only explicit QA issues, with no fixed repair-attempt ceiling. Use for the factory FIX stage.
---

# Codex Game Repair

## Trigger

Use only when a validated QA report has error issues. This is allowed to modify
`workspace/game`. Do not refactor unrelated code, change approved style, or invent improvements not in QA.

## Inputs and outputs

- Inputs: the validated QA issue set (including `qa-report.json`, `qa-natural-journey-report.json`, and
  `perceptual-qa-report.json` when present), Builder `codexThreadId`, generated game workspace, and the locked
  failure-pressure contract. Pass only the minimal issue records and relevant artifact paths.
- Outputs: modified workspace, rebuilt `dist/`, structured fix evidence; next stage is the complete QA suite again.

## Procedure

1. Extract issue ids, messages, and evidence. Form a narrow repair prompt that quotes no unrelated requirements.
   For screenshot/reproduction issues, include a reproduction matrix (object type × lifecycle/state branch ×
   renderer/presentation path × device/viewport) and require identification of the owning branch before editing.
2. Resume the stored thread id; if unavailable, start a workspace-scoped thread and record the replacement id.
3. Modify only files causally connected to listed issues. Build Web and increment the attempt exactly once.
4. Return to QA and rerun deterministic, natural-journey, and perceptual tracks as applicable. Never mark an issue
   fixed based on the model response, unit tests, fixture traces, or Builder's own completion note. The exact
   reproduced matrix cell must be exercised with normal player input and captured in player-visible evidence. Any
   remaining `BLOCKED` natural/perceptual check keeps the product gate failed, even if `qa-report.json` passes.

## Acceptance

Attempt count is positive and monotonically increasing, build exits zero, thread continuity is recorded, and Playwright re-verifies behavior on all
affected tracks. A repair is accepted only when the relevant deterministic assertions pass *and* the default natural
journey reaches startup → core loop → terminal/settlement → replay with player-visible evidence; the exact reproduced
object/state branch has a natural trace and screenshot; perceptual checks must have no unresolved `BLOCKED` result.
Do not silently downgrade a product failure to a structural warning or close it from a sibling branch's evidence.

## Failure

There is no fixed repair-attempt ceiling. After every failed retest, preserve the QA and repair evidence, increment the
attempt exactly once, and continue only when the next attempt has a distinct evidence-backed repair hypothesis. Explicit
cost/time/token/platform ceilings, an explicit user stop, an external hard constraint, or the absence of a viable next
hypothesis may mark the run `BLOCKED`. Codex/build errors count as their current attempt and are logged. Never rebuild
unchanged code repeatedly, recurse without new evidence, weaken acceptance criteria, or replace the whole template.
