# Codex handoff: keep the next steps small

## Scope

Target: `grid-merge-v1` candidate mother template. Generated work must identify an exact
`runs/<run-id>/workspace/game` first. Shared changes are limited to this candidate,
`tools/lean-pilot`, its examples/tests/docs, package scripts and the dedicated pilot CI.
Do not modify `src/factory.ts`, existing production-line registration, legacy model routing,
old PR #1, FORM business code, or frozen FORM F00-F38 specifications as part of this pilot.
No REA setup, paid calls, deployment, merge, force push or changes to connected accounts.

The native validator is an explicit offline-tool boundary, not a replacement for Zod at
existing Agent exchanges. No Agent output is imported into the legacy pipeline by this code.

## Established contracts

`engine.mjs` accepts a complete state and one of up/right/down/left. It returns a new state,
pre-spawn board, score delta, movement/merge/spawn events and whether the move changed anything.
It does not mutate inputs or access time, DOM, storage or network. A valid move spawns exactly
one tile; an invalid move consumes neither RNG nor moves. Merged tiles cannot merge again
in the same turn. Win pauses until acknowledged. Loss requires no empty cell and no legal pair.

`main.mjs` is the default real entrypoint. Pointer/touch, keyboard and visible direction
buttons all use that core. The only exposed probe is a defensive-copy getter. Do not add
setState, giveMoney, forced win or a hidden replay script to the natural-input journey.
Storage errors are visible and do not stop play. Theme saves are separate and rule-versioned.

`research.json` distinguishes code observations from gameplay observations. SHA-256 is computed
from archived bytes, never written by a model as proof. Excerpt hashes are not full-source
hashes. Quoted source text is checked; a match is not semantic truth. Missing core claims
block. Unknown revenue or an unmeasured human response remains explicitly unknown and is
handled by the appropriate later gate, rather than blocking unrelated engineering.

Reference: `gabrielecirulli/2048` commit `478b6ec346e3787f589e4af751378d06ded4cbbc`.
The runtime core and visual presentation are newly authored implementations of generic rules.
The MIT-licensed code excerpt is research-only, stored with the full original license under
`examples/lean-pilot/reference/`; it is not bundled into the game. No third-party artwork,
brand assets, music or font files are used. Do not infer permission for other proprietary code.

## Three work packages, not dozens of new task cards

1. **Finish real browser/device verification.** Run `pilot:browser` on a host that allows
   loopback navigation, then a real phone. Keep the current tests and thresholds. Classify
   environmental failure separately from game failure. Screenshot the exact failing branch.
2. **Collect a small uncoached human screen.** Five consenting anonymous participants;
   record prior familiarity, time to first merge, session duration and voluntary continuation.
   Use `human-review.example.json`; records bind run ID and build hash. Put evidence under
   that run, never in this public repository. Source origin/consent require reviewer attestation;
   byte hashing does not prove someone was a human. Suggested threshold: 4/5 first merges
   within 30 seconds and 3/5 voluntary continuation. This is not a population retention estimate.
3. **Decide, do not automatically expand.** If the above passes within budget, compare the
   second theme, then decide whether a meaningful differentiated product and an acquisition
   experiment are justified. Only after that consider legacy template registration or one
   distribution platform. A cosmetic variant alone is not a separate commercial release.

## Stop conditions

Stop on incorrect evidence identity/hash, changed frozen acceptance or research inputs,
missing permission, unknown monetary charge, exhausted managed budget, a held lock/pending
reservation, stale build evidence, or the need to expand scope. Do not lower thresholds,
auto-clear an interrupted reservation, or create fresh run IDs to hide failed revisions.
Keep the failed record and state the smallest next question. The owner need only approve
product direction/budget, core continuation and later commercial continuation.

## Commands

```sh
npm run pilot:test
npm run pilot:typecheck
npm run pilot -- init evidence-run observatory
npm run pilot -- check evidence-run
npm run pilot:browser -- evidence-run
npm run pilot -- report evidence-run
```

A correct report can say engineering PASS, browser FAIL/NOT_RUN, human NOT_RUN and
publishable false. That is more useful than a false all-green completion badge.

## Executor startup checklist (mandatory)

Use branch `feat/lean-grid-merge-pilot-20261012`, PR #2; fetch current HEAD first.
Do not reset, force push or overwrite someone else's work. Read `git status --short`;
if tracked work is present and its ownership is unclear, stop and report it.
Read `PILOT_START.md`, this file and `VALIDATION.md` before making changes.
Run `npm run pilot:scope` and `npm run pilot:test` before editing. Preserve the baseline.
The scope guard checks the audited base, not an arbitrary model-chosen base. It permits only
pilot paths and additive `pilot:*` scripts; existing package fields/scripts must not change.

### One execution cycle

1. Reproduce the exact failed case from CI, a run report or consenting playtest notes.
2. Add one failing regression for that behavior. Do not modify another test to hide failure.
3. Patch the smallest relevant file(s). The template is reusable source; a run is a copy.
   Editing `templates/` does NOT patch an existing `runs/<id>/workspace/game` automatically.
4. Run native tests, typecheck, scoped ESLint, and a browser check on the exact candidate.
   Keep the old run if shared frozen acceptance changed. Record why a new run is necessary;
   creating fresh IDs to reset a product's failed-revision budget is prohibited.
5. Read the generated report, inspect relevant screenshots, and record PASS/FAIL/BLOCKED/NOT_RUN
   separately. A successful tool exit is not a human-playtest approval.
6. Commit only approved source/docs/tests, update the existing Draft PR, then read the actual
   GitHub Actions result for the new head. Never claim CI success from an older commit.

### Quick symptom-to-file map

| Symptom | Inspect first | Required regression |
| --- | --- | --- |
| Wrong merge, score, RNG or save validation | `engine.mjs` | native rule test |
| Touch, dialog, animation, storage warning | `main.mjs`, `style.css` | precise HTTP browser case |
| Old report still green after edits | `runner.mjs` | stale-report test |
| Broken standalone export | `standalone.mjs` | marker/import guard + browser rendering |
| Incorrect quality/cost denominator | `form-metrics.mjs` | failed/unknown attempt fixture |
| Missing module/browser executable | dependency install/CI log | environment BLOCKED, not a game patch |

The existing browser suite has 11 named checks. Four check layout; five use scripted normal
input (touch, reload, cancel, loss/replay, theme isolation); two explicitly inject fixtures
(win/continue and storage denial). Do not relabel fixtures as natural play. Screenshots and
suite identity are hash-bound; missing/changed evidence cannot remain PASS.

### Exact local commands when dependencies are needed

Use Node 24.x for the locked dependency lane. Keep `pnpm-lock.yaml` unchanged.
`pnpm install --frozen-lockfile --ignore-scripts` installs existing dependencies, not a model.
Then run `pnpm exec playwright install --with-deps chromium` on an approved developer host.
Do not install random latest versions when the frozen install fails. Record the exact error.
For source checks: `pnpm exec eslint tools/lean-pilot templates/web-lite/grid-merge-v1`.
For the offline FORM tool: `npm run pilot:form -- /absolute/path/to/recorded-benchmark.json`.
The example is intentionally NOT_RUN and must be rejected until actual observations exist.

## Evidence is auditable, not cryptographically trusted

Local run metadata and hashes catch mistakes and stale evidence. They do not defend against
an operator who maliciously rewrites the metadata, test suite, report and hashes together.
Independent reviewer inspection and commit-bound CI logs remain required. No local flag,
raw screenshot or self-authored JSON can certify that a human actually played the game.
The native checker uses same-process Node test isolation so its timeout kills the owned
check process rather than leaving a Node test worker running after a timeout. It is still
not an operating-system sandbox for hostile code; run only reviewed code in a clean host.


## Known remote issue at this handoff

Read REMOTE_LIMITATIONS.md before the first browser run. The 320x568 first-viewport test
is expected to expose an uncommitted CSS correction. Do not claim a local green image
proves remote success. If a write or environment is blocked, preserve that state rather
than switching channels or weakening the test to produce a green badge.
