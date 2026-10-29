# Real subscription loop — 2026-10-29

**PARTIAL / BLOCKED. Do not merge or claim autonomous production.**

## A — Model entry

Both historical HTTP400 responses explicitly reject the supplied model ID (`account-default`, then `gpt-6.1-sol`); neither contains completed inference. Browser readiness and ChatGPT login were not the rejecting boundaries. The global config also names the rejected alias: omitting `--model` alone was insufficient.

Stage/tier defaults now carry a display-only `account-default`; the CLI omits `--model`, uses `--ignore-user-config`, forces native OpenAI + ChatGPT authentication, and does not inherit API credentials. Explicit IDs are syntactically validated, not checked against a speculative model catalogue. Configuration/auth/model rejections never capability-escalate or retry. The separately authorized API provider does not receive the subscription sentinel.

Two installed CLIs exist: `~/.npm-global/bin/codex` 0.156.1 and `/usr/local/bin/codex` 0.147.0. The actual child PATH resolved 0.147.0. Its real Fixer session `turn_context` reports `gpt-5.6-sol`; no cache entry was used to select a model. The exact first QA executable/arguments are in its request artifact. Global login/config were not edited.

The second historical receipt was audited against its exact raw HTTP400, preserved archived copy and native error-only event sequence. Only status changed from uncertain to complete, with its original sequence, attempt, token counters, times and model unchanged. Original uncertain receipt and reconciliation hashes are retained. This is **not** a reset or a monetary billing receipt. The new real-inference FIX receipt remains **uncertain** and is not reconciled/cleared.

## B — Independent QA

One real frozen reviewer turn completed: **23,283 input + 4,042 output = 27,325 observed tokens**, 66.358 seconds. It received 8 candidate PNGs (5 original stills + 3 chronological sheets / 18 sampled frames) and 3 verified reference sheets. No browser operation by the model is claimed.

Actual isolation: isolated HOME/CODEX_HOME, read-only link to existing login, no global config/rules/plugins/apps/shell/view-image/subagent tools, and an outer macOS Seatbelt read boundary. Original source, oracle, historical repair and other-execution reads were actually denied; traversal/symlink/write negatives also pass. Runtime/OS libraries and CLI authentication are infrastructure permissions, not model tools. Unsupported non-macOS hosts fail closed instead of degrading to cwd-only isolation.

QA independently found **replay**: after ordinary terminal replay taps at 22571ms and 23852ms, the completion overlay remains, with matching post-control image hashes. The controller supplied no missing-callback answer. The actual source change later confirms this observation. No confirmed implementation false positive is established.

Full acceptance remains BLOCKED: failure/recovery and exact movement/collision timing were unobserved. The model also emitted a protocol error: comparison pointers identify images, not the supplied capture JSON. Its raw report is preserved, not silently repaired. Sampled video times are not a synchronized input clock and cannot prove transient absence between frames.

The full verifier initially rejected mixed unobserved cases plus a valid implementation discovery. A minimal projection now independently validates implementation discoveries with the existing strict source/build/trace/image/branch checks. It does not modify the full review or release gate; unknown/research/design findings remain deferred. The same saved real report admitted only its genuine `replay` discovery without another first QA call.

## C — Real Fixer, interrupted completion

One actual existing `FixerAgent.runFormal` invocation ran on the exact legacy prototype workspace, with only the validated QA issue. Its declared package scripts were used instead of imposing idle-shop APIs/Vitest or a nonexistent recording-level design contract. New template defaults and recording-bound project checks remain unchanged; the pilot explicitly refuses this mode if a recording-level production contract exists.

Fixer, not Controller, changed:

- `src/main.ts`: replay listener invokes the existing reset function.
- `tests/level-ui.test.ts`: focused production-entrypoint regression.
- One FIX evidence JSON; attempt remains 1 and the actual replacement CLI thread is stored.

The real tool trace preserves the failing targeted test before the source patch, then passing targeted checks. The host preserved the actual Git diff and built **once** after interruption.

Build directory hashes:

- Before: `32a499d21023799d50a81236bf5461f28a35e09f210b8609ec037b22141ab5e0`
- After: `ede85e168a738465002ccd2b70a22a666f2840d873dbc61edade15c556ba3e5e`

Host lint/typecheck/build pass. Full game regression: 332 pass, 3 fail, 1 skipped. All three failures also reproduce against the untouched before-source snapshot: missing historical approved asset manifest, missing alternate 3D POC package, and an existing level-density assertion. None was weakened or fixed outside the issue.

Fresh host normal input (46 actions, screenshots/video/trace) now shows replay → ready → new action. **This is not an independent model retest**, not a completed formal FIX stage, and not proof of fun or publishability.

## D — Stop and production readiness

Fixer completed one native turn containing **21 tool commands**. Its only `turn.completed` usage event reports **1,506,738 input (including 1,417,216 cached) + 10,074 output = 1,516,812**. This is not a parser double count: there is one usage event, and cached input was not added again. The 172,675 remaining observed-token allowance could only be checked after that long turn had already spent it. The process was stopped; its output was not accepted and receipt stays uncertain.

**No additional model inference was launched. Independent QA retest is BLOCKED.** New purchases/API credits were not used. No account billing amount is exposed, so money remains UNKNOWN. A smaller initial handoff did not establish a cheap writer: ambient skills and repeated tool context were loaded; per-step causal token attribution is unavailable. No new agent, model swap, budget increase or speculative cost-control architecture is presented as a proven remedy.

Research→Builder required contract inputs, implementation/design/research routing, post-fix rebuild/re-QA, historical issue retention, and idempotent matching-build review reuse remain wired and regression-tested. This round actually proves native entry + frozen independent discovery + a real source repair, **not** a fresh game's Research→Builder production or independently accepted repair loop.

The next source check reuses the exact 36.492-second, 292-frame/19-sheet verified user recording (SHA in `next-source-check.log`) for a one-level original paper-mechanism prototype. See `production-readiness.json`: source bytes are available, but input/failure/replay causality and new-run binding still need the existing admission process. Do not auto-start a new Research or game run under this experiment's authorization.

## E — Verification and evidence

`result.json`, `source-changes.json`, `fix.diff`, `evidence-manifest.json`, native raw stdout/usage/receipts, current-round user authorization, first QA, original uncertain receipt and audit, actual read-denial probes, and host post-fix screenshots/video/trace are retained. Third-party reference media and credentials are not exported.

Local commands use `pnpm_config_verify_deps_before_run=false` because this worktree intentionally reuses an existing dependency symlink; the default pnpm pre-run reconciliation otherwise attempts to modify another checkout. No global package-manager config or shared dependency tree was changed. Failed preliminary logs are retained; final local and exact-HEAD GitHub CI evidence are recorded separately.
