> **Acceptance update (2026-10-24):** see [controlled budget and real QA results](../20261023-budget-acceptance/README.md). Run-wide controlled-process tests now pass; blind QA and formal retest retain explicit failures/BLOCKED outcomes. No paid Factory call was made. The original b3bd042 handoff below is preserved as historical context, not the current acceptance status.

# Follow-up tasks requiring the user's local runner

This branch implements a **per-Codex-invocation** streamed token guard. It has not been proven to enforce a **whole-run**, multi-agent budget. No real paid Codex call was run. Merging requires the usual full CI and reviewer approval.

## A. Validate this branch before merge

Base PR #74 on PR #73, then run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm exec vitest run tests/unit/codex-cli-provider.test.ts --maxWorkers=2
pnpm exec vitest run --maxWorkers=2
```

Keep failures, raw exits and exact commit SHA. Verify that streamed usage reports may arrive after backend tokens were already spent. Do not claim strict financial ceilings.

## B. Integrate real run-level cost control (P0)

Design and verify a single run-owned budget lease covering Research/Builder/Fixer attempts and retries. Explicitly include cached-input usage in total tokens once (do not double-count), incomplete/timeout attempts, resume calls and prior attempts. Only allow a new invocation if sufficient budget remains. Stop on budget/cancellation and persist an append-only receipt of the observed lower bound even for failed calls. Track process group termination and signal races with controlled child processes. A delayed or missing usage event must fail closed for any configured budget. Test concurrency, crashes, retries, stale state, and bypass via old launch paths.

Use `CODEX_RESEARCH_MAX_TOTAL_TOKENS` and `CODEX_EXEC_MAX_TOTAL_TOKENS` only as invocation-level guards until the run-level lease is proven. Do not artificially relabel incomplete usage as complete or assume token ceiling prevents all overspend before telemetry.

## C. Complete a genuinely blind QA (P0)

Reuse the existing Slice Master recording and unchanged candidate from the verified local legacy run. Obtain the approved behavior contract and enough neutral coverage to observe a full core interaction, including finish/replay and mobile dimensions where relevant. Freeze evaluation intent and test plan **before** Agent execution, do not reveal the known spatial/grouping diagnosis or issue labels to QA. Report what was actually observed and what could not be observed. Independently adjudicate true and false positives; keep rates NULL until denominators and observation coverage exist. Do not alter a reference game, use unlicensed assets, or manufacture missing input traces.

## D. Safely restore old run and validate FIX (P0)

Legacy `mobile-slice-adaptation-20260830` lacks a canonical seed/state/permission binding. Audit the original local evidence with user-authorized workspace access and use an explicit migration mechanism where available; never fabricate missing approval or reset the current game. Once run identity and defect cause are confirmed, do one narrow production FIX and an independent same-build QA retest. Keep automatic retries <=5, every repair version, and exact evidence receipts. Do not conflate synthetic tests with player acceptance.

## E. Review evidence publication (P0)

PR #73 contains legacy local absolute paths and manifests. Check whether any disclosed path, username, source location or private artifact identity should be public; sanitize before publication without rewriting hash-bound evidence deceptively. Consider moving private raw receipts to an authorized private archive while keeping verifiable public summaries, after checking link and hash dependencies.

**Report:** exact tested SHA/CI result, detected and unresolved defects, full cost accounting, blind-QA coverage, outcome of one repair/retest attempt, and all still-BLOCKED approval gates. No percent quality/cost improvement without matched evidence.
