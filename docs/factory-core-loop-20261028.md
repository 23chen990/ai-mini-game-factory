# Core-loop production correction — 2026-10-28

Status: factory control-flow verified; real production-quality proof BLOCKED. No autonomous-production or gameplay-quality claim.

## Scope and four-question decision (before implementation)

Target: shared factory. Read-only historical pilot: `mobile-slice-adaptation-20260830`, workspace `runs/mobile-slice-adaptation-20260830/workspace/prototype-a`. Reuse the current QAAgent, replica-preview stages, schemas, Codex subscription provider and artifact archival; no additional agent, gate, stage, paid API or model change.

1. **Observed case, expected/actual.** Historical `GAP-LEVEL-GRAMMAR` (`research-slice-core-20260930/synthesis/gap-matrix.json:68–77`) was carried into P1, passed on an isolated superseded snapshot, then explicitly deferred in `core-rebuild-20260930/coordination/scope-cuttable-deferred.json:3–17`. The course-worker result left density checks open. It was not a current-build closure. Independent attempt13 review (`factory-eval-20261024/independent-video-review/result.json`) is BLOCKED, with stack lifecycle unobserved. In current production code, `executeReplicaPreview` invokes FIX for engineering QA errors, but a failed independent fidelity review only writes a task and waits. Expected: an observed implementation defect can reach Fixer and mandatory re-QA; insufficient evidence cannot be mistaken for such a defect.
2. **Causality vs uncertainty.** Static call tracing establishes the missing reviewer invocation and missing return edge, not a defect in current gameplay. The new integration fixture checks actual call count; schema/gate tests check discoveries outside the contract. These distinguish orchestration omissions from a weak reviewer/model or unavailable reference. Current course density and player fun remain unknown until exact-build normal-input evidence exists.
3. **Cheaper alternatives.** Keeping the current system costs no code but leaves manual dispatch mandatory. Prompt-only changes cannot create the missing call/return edge. The selected local correction extends the existing review with root-cause-bearing discoveries and plugs the existing independent reviewer/Fixer into preview orchestration; reuse frozen inputs and source/build hashes instead of repeating research. No fleet, new workflow framework or complete level reconstruction is introduced. Extra cost: at most one independent comparison per changed build/contract, plus only evidence-backed repairs. Failed/unobserved reviews remain explicit blockers. Token usage is observational, not a hard generation cap.
4. **Retain/revert experiment.** Same deterministic preview fixture before/after: reviewer call count 0→1; contract-passing/out-of-contract error must block; a validated implementation issue must invoke Fixer, rebuild once, then invoke independent QA again. Research/design/evidence/unknown findings must not be blindly sent to Fixer. Repeated unchanged build or identical failed hypothesis must stop, preserving history/counts. Regression: original reference-preview approval flow and all source/branch/build binding tests remain intact. Retain only with lint/typecheck and no new suite failures. Real subscription-model/normal-input experiments are separately labeled and cannot be replaced by these fixtures. Stop additional calls on an observed external blocker; continue deterministic code work.

## Baseline

HEAD before work: `1eb8a194`. Existing working-tree changes excluded from delivery: AGENTS.md, model-policy source/test changes, 830 tracked deletions and unrelated untracked files.

`pnpm verify`: lint/typecheck PASS; 191 test files pass, 5 fail; 1191 tests pass, 15 fail, 5 skipped. Failures refer to absent historical run artifacts/workspaces (action-experiment, cocos-3d-runtime, toy-factory-research-artifacts, village-south-artifacts); they are not evidence of a current pilot gameplay failure. Do not restore deleted user data or silently skip tests.

The requested GitHub repository has unrelated history to the original checkout. Delivery was therefore ported as a narrow patch onto target-main `5ff8d88945d76fa7dc6b3dd65aa8f9aa58324217`, without merging the old branch or restoring deleted run data. The final 175-file suite belongs to that target-main checkout, not the larger original-checkout baseline.

## Actual execution and final results

Implementation and local verification are complete; exact-HEAD GitHub validation is reported on the PR. Historical evidence is retained, never relabeled as a new experiment. A browser prototype is not a WeChat/Douyin/TapTap publishable package.

### Acceptance-review corrections (before implementation)

The production-mode two-repair fixture reproduced `Stage QA exceeded its bounded retry policy`: QA's two-attempt window was counting required retests as retries of the old candidate. The smallest correction is to subtract completed/started repair cycles **only for the QA policy check**, retaining the monotonic recorded attempt count and all existing FIX/cost caps. No new stage/agent or larger FIX budget is warranted. Retain only if a third QA cycle runs after two distinct changed-build repairs, while repeated same-build/no-progress repairs still stop.

Independent code review also found that old matching-hash reviews lacked proof of the new discovery protocol, and preservation copied untrusted evidence with `copyFile`. Add a controller-recorded protocol marker for automatic-review reuse; use the existing no-symlink/hash-checked reader before preserving bytes. Alternatives (reuse legacy reviews, or lexical path checks alone) fail the corresponding regression. Recheck source bytes both for acceptance and repair dispatch, not just the first model call. These corrections do not certify source observations or current gameplay quality.

## Actual pilot, not fixture success

- One **real** subscription Codex CLI reference-frame study completed (existing `gpt-5.6-luna`, unchanged): 117,714 ms; 57,735 input tokens including 32,384 cached; 6,877 output; 64,612 observable total. Eight source-bound observations, five critical unknown groups. Input/collision/failure/replay causality was **not** established from static frames. No real Research→Builder prototype was produced from this study. It is supplementary evidence, not a completed factory research stage.
- A fresh independent QA agent received only verified reference media, frozen candidate identity and neutral player-experience instructions, not historical defect answers. It tested attempt13 (`c4cc3c…`) and then current dist (`8e5706…`) separately at 390×844 and 1100×720. Normal-input action/settlement and mobile failure/retry were observed. Reference live play stalled/blanked; a separate direct historical-embed probe reached a Cloudflare challenge (no bypass attempted), so the complete dual-input comparison is **BLOCKED**; the existing verified recording is not relabeled a new live session.
- No credible core-gameplay defect was independently established. One current-build mobile guidance-overlap warning was reproduced and triaged. **It was deliberately not repaired to masquerade as a core-loop improvement.** There is no real gap-driven game repair/retest in this delivery, no new automatically produced prototype, no second-game generalization experiment, and no proof of fun or autonomous game production. No success percentage or model-total cost is invented.
- Actual generated-game files/builds are unchanged. Existing reference media and game artifacts remain local. Public reports contain hashes, conclusions and provenance, not third-party media/code or a generated game export. The legacy pilot still requires standard-run migration before default factory resume.

## Delivered control-flow changes and limits

The default subscription provider can now perform the independent comparison rather than merely receive a generated task. QA receives source evidence, neutral candidate screenshot/flow artifacts and shipped dist, not Builder conclusions or known defect lists. QA's read capability is limited to verified/derived reference evidence, shipped output and run evidence; source/quarantined media and game writes remain denied. A successful comparison needs current protocol, source bytes, run/workspace, contract, build and exact-branch natural/perceptual evidence. Earlier out-of-contract discoveries remain required retests on later candidates.

Reproduced implementation findings invoke the existing Fixer, preserve the current thread and counted attempts, rebuild once, and require fresh QA. Upstream research/design/evidence/unknown routes are explicitly **pending**, with an OPEN failure report: this patch does **not** claim an automatic upstream correction was executed. A repeated unchanged build/semantic issue ID stops after the required retest, even if QA rewords its message. All configured FIX/cost/platform limits remain; ledger counts are not reset. Comparison token reserve is a **72,000-token projection**, informed by the measured 64,612-token frame study, **not a hard output-token cap**.

## Reproduction

From the delivery checkout:

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck
pnpm exec vitest run --maxWorkers=2
pnpm exec vitest run tests/integration/reference-review-loop.test.ts tests/unit/reference-fidelity-qa.test.ts tests/unit/reference-review-permissions.test.ts
```

For the existing local browser candidate (not a new build and not platform release evidence):

```sh
python3 -m http.server 4173 --directory '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a/dist'
```

See `reports/core-loop-20261028/` for exact identities, real-model consumption, independent QA and verification. Parent/subagent token usage is not exposed by the collaboration tool, so the CLI figure is not reported as total project consumption. No credits were purchased and no separately billed API was used. Final retain decision: retain narrowly tested safety/control-flow changes; keep production-quality and all three real end-to-end experiment claims BLOCKED/PARTIAL until the missing evidence is obtained. Do not merge unrelated unaccepted branches.

Final local verification on the target-main delivery: lint/typecheck PASS, **175 test files / 998 tests PASS**, release registry regression **4 PASS**. This is engineering evidence only. The original working tree was restored to its exact initial status; the three pre-existing modified files have byte-identical diffs, and all 830 prior deletions remain untouched.
