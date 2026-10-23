# Acceptance results — 2026-10-23/24

## Results, not release approval

1. **Codex controlled-process acceptance passed.** Multi-turn/attempt totals, failed-call usage, run-wide remaining allowance, unique receipts, concurrency exclusion, restart accounting, canonical recovery selection and writer side-entry refusal are covered. No paid Factory model invocation was made.
2. **Blind QA actually ran, but did not complete the core journey.** A new, pre-execution SHA-sealed protocol covered six first-level behaviors at 390×844 and 1100×720. The subject produced 4 PASS / 2 FAIL / 6 UNOBSERVED. Independent review of its original video **refutes both reward-absence claims**: world-local `+1` is visible. The original report is preserved, not corrected in place. Stack, hazard and terminal journeys remain unobserved. This is an unsuccessful actual sample, not an improved detection-rate claim.
3. **Existing formal attempt10 received independent retest, not acceptance.** Exact alternate candidate `28b2879…` retains its thread/attempt/build history. Independent full game tests/lint/types passed, normal play reached low descent, failure/replay and a portrait win/replay/new cut. Exact low-descent cue pixels in both viewports are missing, so natural/perceptual/overall remain **BLOCKED**. No new Fixer invocation, source edit or rebuild occurred. The original white-column issue remains open.

The canonical c4 candidate was not regenerated. Missing canonical state/seed/plan/permissions were searched in the exact run, other worktrees and Git history; no complete same-timepoint backup was found. The migration seed is not an original state backup. Nothing was synthesized or transplanted.

## What the budget mechanism guarantees

For Factory-managed Codex calls sharing one run root:
- Effective authorized run token ceiling is persisted at each normal context boundary, including `implement-formal`; explicit workspace-writer stages reject an absent run budget even if an invocation cap is supplied.
- An exclusive filesystem launch lease prevents two clients spending the same observed remainder concurrently. State usage plus unacknowledged execution receipts is counted once, across stages and restarts. Receipt IDs survive retries/invalidations.
- Completed-turn reported input/output totals accumulate across turns and legacy unbudgeted retries; cached input is not added again. Budgeted failures/timeouts/cancellation/malformed or missing telemetry never automatically retry. Observed partial usage is retained in a typed failure, canonical logs and the run cost state.
- Unique execution logs/output/schema preserve prior evidence. Recovery chooses the newest canonical execution by sequence and acknowledges every receipt exactly once; it does not read an old first-call pointer as the newest call.
- Interrupted/uncertain executions and pre-ledger logs lacking a trustworthy execution binding block further budgeted launches. No stale lease is automatically cleared and no historical usage is guessed.
- POSIX termination covers the CLI's process group; the controlled test includes a TERM-ignoring tool descendant.

**This is NOT an absolute token or financial hard cap.** A usage event can arrive only after work has already happened. The controlled run with limit 100, historical usage 80 and subsequent reports 15 then 10 observes **105**, stops, preserves the overshoot and refuses another launch. Stage reserves remain estimates. In-flight remote work, delayed/unreported tokens, daemonized tools outside the process group, event-loop scheduling, controller SIGKILL and filesystem failure cannot be made into a vendor billing guarantee by this patch. Windows only terminates the direct child; descendant termination there is unverified.

Installed CLI 0.147.0 / SDK 0.151.0 resume telemetry has **not** been calibrated with a paid call. The parser follows the documented per-turn shape, retaining raw snapshots; it does not guess cumulative differences. The [official JSONL example](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable) shows usage on `turn.completed`. Historical counters are not an invoice; unknown money stays null. Direct legacy calls without stage/run budget and tools/subagents outside this provider are outside the run-budget guarantee.

## Real QA/evaluation limitations

- Blindness used a fresh subagent, no history/defect answers, a sealed positive contract and a declared file boundary, **not an OS access sandbox**. No gameplay hint was sent. One controller administrative stop was sent; the humanInterventions array alone does not represent that controller event.
- Blind wall time was at least 721,000ms against a 600,000ms protocol; independent retest at least 1,032,000ms against 600,000ms. Both overruns are failures, not successful time caps. These app subagents do not run through the Factory Codex provider. Their tokens and money were not exposed.
- Long actual input gaps (portrait first/second taps 25,703/68,697ms; desktop 35,142/57,018ms) mean early falls are not automatically a game root-cause finding.
- No complete current-build defect gold exists. `qaDefectGoldComplete` must explicitly be true before Agent Eval computes QA detection/miss/false-positive rates. Protocol-quality judgments use separate `taskSuccessRate`; unknown gold gives null defect-rate denominators. Route tests and deterministic controls remain separate from live/historical Agent evidence.
- The new canary shares the earlier slice family; it is **not holdout evidence**. The two independent holdout families remain unexecuted. The completed live QA experiment is scored unsuccessful; Research/Builder/Fixer success remains unmeasured or blocked. `sourceRevision` pins the unchanged Factory/skill baseline b3bd042 used by the external QA task, not an invented source commit for the untracked game; the game is bound by its build hash.

## Reproduce/check

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm factory eval --agent-results docs/upgrades/20261023-budget-acceptance/agent-observations.json
node tools/release-status/validate.mjs
node --test tools/release-status/validate-checks.mjs
```

See retained RED logs, `all-tests-complete.log`, the actual `agent-eval-report.json`, `blind-adjudication.json`, `repair-continuation.json`, and `publication-manifest.json`. Raw videos/reference media stay in their exact local runs; no third-party reference recording was uploaded. Public copies contain reports/input traces/scripts-as-text and four decisive candidate frames; local raw inventories carry SHA-256 for the full evidence.

PR #74 remains stacked on #73. Neither PR nor any independent game PR was merged. The narrow Agent Eval basis correction is an acceptance follow-up to #73 contained in #74; merge-order/dependency is unchanged.
