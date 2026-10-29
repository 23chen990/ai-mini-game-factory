# PR75 verification and continuous QA — 2026-10-24

## Verified factory change

PR75 original HEAD `31838a3` had full CI green: 193 files / 1,233 tests, lint/types and release registry. Review then reproduced a missed path: an **unbudgeted failed attempt followed by a successful retry retained its first partial last-message without redaction**. The new regression failed before the patch. Redaction now runs after every attempt, without publishing failed/stale output or enabling any budgeted retry.

Implementation `e8f30de2cf4369d2db6c838e1afa6ab26733a284`: local lint/types and 193 files / **1,234 tests** pass; 23 controlled-budget process/accounting tests and 22 provider tests pass. [Exact implementation CI](https://github.com/23chen990/ai-mini-game-factory/actions/runs/39998921920) passed both jobs. RED, initial lint/type failures, and GREEN logs remain in `logs/`.

This is **not an absolute financial/token cap**. Factory-managed calls sharing a run root use observed-usage admission/stop and fail-closed receipts; delayed/in-flight usage can overshoot. No paid Factory model call was made. Desktop QA agents are outside that ledger; their tokens and price are unknown, not zero.

## Real acquisition, unsuccessful primary Agent sample

Same canonical game/workspace and `c4cc3c4…` candidate, same verified `3781e4dc…` reference; no game source edits, regeneration or rebuild. Packet, policy and recorder hashes were sealed **before navigation**. Eight fresh contexts at 390×844 / 1100×720 ran continuous ordinary touch/mouse APIs, not debug hooks. Actual acquisition: **332,182ms, 442 inputs, 14 visible replay clicks**. Median gaps were 442–1,138.5ms depending on policy, not inter-tool think-time. All eight complete candidate videos, input traces and browser events are published here; no third-party reference movie/images were copied.

This acquisition was **controller-authored/assisted**, not an autonomous QA play policy. The first subject viewed all 19 verified reference sheets but produced no plan/runner before a preparation stop (~30 minutes). It then inspected only eight 1FPS candidate overviews, not dense video. Raw judgment: **0 PASS / 0 FAIL / 12 UNOBSERVED**, natural/perceptual BLOCKED. Review reported 908,000ms against 600,000ms; it was administratively stopped. Some positive-UI timestamps are mislocalized. The raw report is immutable; `subject-adjudication.json` records contradictions separately. No detected game defect or detection/recall rate is claimed. The known prior v2 reward-absence false claims remain in the earlier audit, not rewritten.

The root reviewer subsequently inspected dense candidate sequences showing cutting, a fall/failure/retry/new cut, and completion/replay/new cut. Video and input-clock epochs were not calibrated; extraction timestamps are approximate, not response-latency measurements. Root already knows history: these are **non-blind administrative verification**, not a replacement blind result or 12-case PASS. A separately isolated reviewer then inspected dense/native candidate frames and the verified reference. Its judgment is **2 PASS / 2 FAIL / 8 UNOBSERVED**. It independently identified **one reward-order problem across two viewport cells**: local `+1` and cumulative HUD are already updated while the first watermelon still appears intact; visible separation follows. Root independently checked all six cited native frames and confirmed this positive ordering counterexample. This does **not** retroactively validate the earlier v2 absence claims. Finish → settlement → replay → renewed cut is verified at both viewports; spike-contact and complete stack lifecycle remain unobserved. Review took **1,629,804ms against1,200,000ms**, with an administrative stop; whole-scope/timed-task status remains **BLOCKED**. See `independent-adjudication.json`, raw `independent-review/result.json`, triage and native frames. No fresh gameplay occurred for this review, and it cannot upgrade the failed primary subject.

## Restoration / repair

Canonical `state.json`, original `input/seed.yaml`, `artifacts/pipeline-plan.json`, and `artifacts/permission-manifest.json` are still missing. Prior exact-run/worktree/Git history search found no complete same-timepoint backup. PR75 adds no legacy-adoption mechanism. **Canonical Fixer remains BLOCKED**; no state, approvals or historical cost was invented.

Alternate formal attempt10 retains build `28b2879…`, stored thread and attempt. It is a different candidate; its state is not transplanted into c4. Prior low-gap cue retest and original removed white-column branch remain BLOCKED. The newly confirmed reward-order issue follows the formal QA→Fixer route but remains blocked by that canonical restoration gap. New game fixes/builds/Fixer calls in this turn: **0**. Factory regression success is not proof that the canonical game tests, natural journey or platform packages pass. No game/PR was merged.

## Recheck

From the repository root:

```sh
pnpm lint && pnpm typecheck && pnpm exec vitest run --maxWorkers=2
node --input-type=module < docs/upgrades/20261024-continuous-qa/verify-evidence.mjs.txt
node tools/release-status/validate.mjs
node --test tools/release-status/validate-checks.mjs
```

`publication-manifest.json` binds exact copied bytes to their original absolute paths/SHA-256. Raw per-frame extractions remain local unless explicitly listed. Full natural/perceptual acceptance and all three platform packages remain unapproved. PR dependency remains **main ← #73 ← #74 ← #75**; no independent game PR was touched.

## Costs / omissions

Two fresh desktop review subjects were used (one failed planning/primary review; one independent video adjudication), not new production Agents. New paid Factory provider invocations:0. Desktop model tokens/prices and human active minutes are **null/unknown**; no invented invoice or zero-cost claim. Human gameplay actions:0. Controller policy authorship, capture, preparation/review administrative stops and independent review are explicit in the artifacts. The second review overrun is a failure, not evidence of an enforced external-Agent time cap. Research/Builder/Fixer have no new capability sample; holdout families remain untested.
