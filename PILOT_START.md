# Start here: the low-cost, bounded pilot

This is a working engineering pilot, **not a certified game factory or a released game**.
The user approved implementing the lean plan and pushing reviewable code. This route does
not call Codex or paid models, install REA, merge PRs, deploy, or change FORM business code.

## Run it

From this repository, using Node 22 or newer:

```sh
npm run pilot:test
npm run pilot -- init my-first-pilot observatory
npm run pilot -- check my-first-pilot
npm run pilot -- serve my-first-pilot
```

Open the loopback address printed by the server. The normal theme is Observatory;
Orchard is a second presentation configuration sharing the exact same rule engine.
No package installation is needed for initialization, native tests, preview or export.

```sh
npm run pilot -- export my-first-pilot
npm run pilot -- report my-first-pilot
```

`export` writes a self-contained HTML file into that run. It refuses to overwrite an
existing export. The file can be opened locally; browser restrictions may disable saving,
in which case a visible warning is shown rather than claiming that saving succeeded.

With the repository's existing development dependencies installed:

```sh
npm run pilot:typecheck
npm run pilot:browser -- my-first-pilot
```

`pilot:browser` is the full local-HTTP browser suite. On a QA host that prohibits all
navigation, `npm run pilot:offline-dom -- my-first-pilot` can still test owned inline HTML.
That fallback writes **offline-dom.json**, never browser.json, and cannot satisfy the full
browser gate. It tests rendering and normal input, not real-origin storage or HTTP loading.

## What is actually here

- `templates/web-lite/grid-merge-v1/`: deterministic merge engine, mobile UI, two themes,
  bounded and versioned saves, visible feedback, milestone display, loss/win/replay.
- `tools/lean-pilot/policy.mjs`: real-byte evidence integrity checks, quote anchors,
  critical/noncritical unknown handling, bounded budgets and human screening validation.
- `tools/lean-pilot/runner.mjs`: isolated add-only workspaces, frozen acceptance/research
  inputs, build-bound reports, loopback preview, standalone export, and a persistent budget ledger.
- `tools/lean-pilot/form-metrics.mjs`: offline FORM benchmark arithmetic that retains failed
  attempts, rejects unknown costs being treated as zero, and separates returned from usable images.
- Native regression/property tests and a read-only GitHub Actions workflow with separate native and HTTP-browser jobs.

## Boundaries that matter

The candidate is NOT registered as a mature template in the existing production-line registry.
The legacy orchestrator, Agents, model aliases, old PR #1, and release gates are unchanged.
This explicit pilot is a small path to prove the idea before editing that large control plane.
It is not an alternative way to claim a production release without the existing gates.

Budget defaults: **zero paid spend**, three distinct candidate builds (initial plus two
revisions), 90 seconds per managed check, ten minutes cumulative managed checks. A same-build
rerun does not consume a new revision but still consumes time. Limits apply to this runner,
not to a separately launched Codex session, subscription allowance, or an external provider.
The runner never starts such a session. Interrupted reservations/locks stop work for review.

Raw game runs, local recordings, photos, browser logs and exports remain under ignored `runs/`.
Only the reusable template, tools, source references and redacted summaries belong in Git.

First read [known remote limitations](docs/lean-pilot/REMOTE_LIMITATIONS.md).
Read [validation](docs/lean-pilot/VALIDATION.md), [handoff](docs/lean-pilot/HANDOFF.md), and
[FORM research adapter](docs/lean-pilot/FORM_ADAPTER.md) before claiming additional completion.

## Current developer entrypoints

- `npm run pilot:scope`: enforce the narrow PR file/package boundary.
- `npm run pilot:form -- /path/to/recorded-benchmark.json`: offline arithmetic only.
- `.github/workflows/lean-pilot.yml`: separate native and full HTTP-browser CI jobs.
  CI uploads only synthetic/native logs, review HTML and generated screenshots. It never
  uploads human records, photos, credentials or raw provider data.

Give the next coding model this instruction:

> Continue Draft PR #2 on feat/lean-grid-merge-pilot-20261012. First read PILOT_START.md,
> docs/lean-pilot/HANDOFF.md and VALIDATION.md, inspect the current head and CI, then run
> pilot:scope and pilot:test. Fix only a reproduced, in-scope failure using a regression test.
> Do not alter FORM, the old factory, dependencies, acceptance thresholds or release settings.
> Do not create human evidence, reset failed-run budgets or claim commercial validation.
> Return the exact new commit, tests actually run, CI status and remaining blockers.
