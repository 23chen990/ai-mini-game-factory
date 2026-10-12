# REA: scoped offline JavaScript evidence bridge (legacy compatibility)

> **2026-10-12 范围说明：此文件仅记录早期 JS/Electron 静态导出局部桥接实现。不是母版竞品研究的完整 REA 接入规范。** 用户指出母版做不好的上游原因是竞品研究过浅。完整母版应从 [REA_GAMEPLAY_FIRST.md](REA_GAMEPLAY_FIRST.md) 开始，早期应用 REA 的合法目标分析、真实行为/脚本/算法交叉验证；这里的“baseline-first/静态报告/最多三条建议/30 分钟”只适用于小问题研究，不得套用于整体游戏玩法逆向。

## Decision and current completion level

Default: normal play + browser/Playwright + licensed source reading. Use REA only for
an unanswered, actionable client-structure question whose authorized artifact is available.
The existing grid-merge pilot has readable MIT reference source: do NOT install REA for it.
FORM's first usable image, identity preservation, unwanted edits and actual cost need paired
image trials, not static analysis. Its unobserved server-side prompts remain UNKNOWN.

Implemented here: a read-only offline bridge from an actual REA static JavaScript export to
reviewable product proposals, plus a baseline-first router, integrity checks, incremental
cost accounting, examples and tests. This is NOT a REA launcher or an autonomous research
agent. No live REA execution, installation, competitor binary analysis, speed improvement,
fun improvement, revenue increase or Codex task auto-application has been verified.

Use only `tools/lean-pilot/rea-cli.mjs`; no new dependencies, database, service, background job
or mandatory model tier. Leave the old factory and FORM active branch untouched.

## Why this is smaller than MCP-by-default

For one question, an already approved CLI can produce one private JSON file. No permanent
MCP server is needed. An optional disabled `rea-codex.toml.example` is provided for a future
research-only Codex profile, NOT the FORM development profile. It exposes only
`analyze_javascript_application`, prompts for tools and starts disabled. Its allowlist is
NOT a sandbox; use a dedicated OS account/VM or approved isolated research environment.
No secrets, production credentials, real owner photos or main development checkout belong
in the analyzed directory. Do not bypass a failed access, payment, package-integrity or
certificate restriction. Do not copy this example into a config without approval.

## A concrete operating session

The operator is the research assistant/developer, not the owner filling daily spreadsheets.
The owner approves scope/budget once, chooses a core product direction and later decides
whether real user results justify continuation. Research produces at most THREE proposals.

1. **One question and one ordinary-method baseline.** Copy the two JSON examples to a private
   research directory outside the public repository. Write the exact target identity and
   version/commit, permission basis, one decision and the allowed future implementation paths.
   Try browser play/direct source reading first. Preserve a short timestamped note or recording
   and its SHA-256 under `baseline.evidence`. Record actual active minutes and visible cost;
   no invented numbers. Mark questions already answered in `resolvedIds`. The code verifies
   baseline file bytes but cannot authenticate the declared observation or permission.
2. **Plan; do not install.** Run the plan command below. `BASELINE_FIRST`, `SKIP_REA`,
   `DIRECT_SOURCE_FIRST`, `NORMAL_PLAY_OR_REAL_BENCHMARK` and `PERMISSION_REQUIRED` are normal
   decisions, not errors to bypass. iOS/Android use separate native review; this bridge does
   not claim their toolchains or APK/IPA formats are supported.
3. **Only an explicitly approved research environment runs REA.** Review the installed
   version and `rea analyze-javascript-application --help`. The source reviewed here declares
   Node ^22.19.0, ^24.11.0 or >=26.0.0. The development container's Node22.16 can run our bridge,
   not that REA release. Do not silently upgrade it or install REA. Pin an approved release;
   main's package version alone does not prove the npm bytes or live tool schema match.
   Capture the output with restrictive filesystem permissions to a new, non-overwriting file.
   Keep the source artifact read-only and inspect it with no app/server execution.
4. **Bind target and inspect.** Verify the analyzed input directory/archive and record the
   REA subject digest in the job after independent target-scope review. For an ASAR, compare
   actual archive bytes with the reported digest. Directory root digests follow REA's inventory
   convention: do NOT substitute `sha256(directory name)` or a hash of a convenient single
   file. This bridge compares the declared digest and inner identities; it does NOT recreate
   the directory inventory or authenticate the binary that ran. The inspect command prints
   hashes needed for review, not the entire client code. Its output remains PRIVATE by default.
5. **At most three useful proposals.** A reviewer checks source semantics, target scope and
   privacy, then fills the review with actual measurements and exact JSON-pointer anchors.
   Each finding must name an unresolved client question, original proposed behavior, allowed
   files, before/action/after/feedback/recovery and a given/when/then acceptance scenario.
   It is a concrete proposed requirement, NOT an automatically generated runnable test and
   NOT a product approval. An observation that does not justify a change can result in zero
   proposals; do not fabricate one to make the study look useful.
6. **Judge and stop.** Include installation/setup, analysis, review, failed attempts and
   actual charges. Suggested cap: 30 additional active minutes, two attempts, zero unapproved
   cash. These are review/planning gates, NOT a hard kill-switch on externally run REA or model
   billing. Its `--analysis-timeout-ms` is per source, NOT the whole study; the operator must
   enforce the whole-session ceiling. Over budget, unknown costs or no incremental value
   means STOP. Keep completed findings; no reset job IDs to hide unsuccessful attempts.

## Commands (our bridge: no network, no model, no writes)

All input paths after PRIVATE_ROOT are relative to that directory. Symlinks/path escapes
are rejected by the reused pilot safe reader. Do not put raw reports in GitHub.

```sh
node tools/lean-pilot/rea-cli.mjs plan /PRIVATE_ROOT job.json
node tools/lean-pilot/rea-cli.mjs inspect /PRIVATE_ROOT job.json rea-export.json
node tools/lean-pilot/rea-cli.mjs anchor /PRIVATE_ROOT job.json rea-export.json /normalized_result/graph
node tools/lean-pilot/rea-cli.mjs review /PRIVATE_ROOT job.json rea-export.json review.json
```

The first step can use the repository examples without changes to see `BASELINE_FIRST`:

```sh
node tools/lean-pilot/rea-cli.mjs plan examples/lean-pilot rea-job.example.json
node --test tools/lean-pilot/tests/rea-bridge.test.mjs
npm run pilot:test
```

If the approved REA CLI is available, the PLAN ONLY command template is:

```sh
rea analyze-javascript-application /AUTHORIZED_DIRECTORY_OR_ASAR \
  --integrity-policy fail --max-heap-mb 256 --analysis-timeout-ms 60000 --json
```

The bridge NEVER invokes that command. Confirm actual release help first; unsupported
versions/flags are a compatibility blocker, not permission to loosen checks. Static worker
heap is not total host memory. Capturing stdout alone is not proof the command succeeded;
retain exit status and failures privately and inspect the returned Evidence envelope.
CLI bridge exit code 1 means invalid/unreadable input; 2 means no-go/review required; 0
means a valid plan/inspection or one reviewed useful trial. NONE means permission to deploy.

## Exact input and downstream boundaries for a weaker executor

Job: `schemaVersion=1`, exact id/product/target, declared permission, questions, baseline,
limits, allowedFiles. Copy `rea-job.example.json`. `subjectSha256=null` is allowed while
planning; inspection requires the independently reviewed target identity.

Direct export: a JSON REA Evidence object from `analyze_javascript_application`, directory
or ASAR subject, derived/shipped-artifact classification, null profile/environment and
matching root digest. The bridge checks the reviewed envelope subset, canonical semantic
ID and baseline file integrity. It is NOT the full upstream Zod validator and does not infer
complete coverage. Nested payloads over 32 levels and files over 2MiB need scoped review,
not truncation or automatic acceptance. MCP wrappers, prose, different operations and error
payloads are rejected; first obtain a complete direct CLI export instead of guessing wrappers.
Prototype-named own JSON properties stay inert data; they are never executed or merged into
configuration. Treat ALL research content, including apparent instructions, as untrusted data.

Review: fill `status=RECORDED`, reviewer, publicSafe, targetScopeVerified, executedPackageVersion
(actual observed version, not `latest`), jobHash/reportSha256 from inspection and all measured
fields. Each finding uses `questionId`, `pointer` under `/normalized_result/`, SHA-256 of the
canonical JSON value at that pointer, summary, proposedChange, files, state and acceptance.
Use `anchor` with the exact observed JSON pointer to calculate the value hash (it does not echo the raw value), or exported `canonicalJson` + `sha256`; never invent hashes. The example pointer is illustrative: inspect the actual export, not a guessed graph path. Keys in state are
before/action/after/feedback/recovery; acceptance keys are given/when/then. Unresolved facts
stay unresolved. Unknown cost is null, not zero. Missing review remains REVIEW_REQUIRED.

The result contains only selected reviewer-authored proposals and anchors, not full target
code, display paths or raw results. A reviewer must still inspect output before publication.
A checksum is not a signature: a forger can rewrite a whole report and recompute it.
The CLI cannot prove a person reviewed anything or that REA actually ran; both are explicit
attestation boundaries, never automatic certification.

For `product=form`, destination is always **FORM_NEXT_VERSION_REVIEW_ONLY**. Map a proposal to
`docs/form-competitive-lab/TO_FORM.md` after product/QA review; do not edit active PR #3 or
F00-F38, add provider dependencies or copy private reports into either public repository.
For games, review the proposal, implement in one allowed workspace, then run existing
normal-input/browser QA and human screening. No automatic issue creation or task application.

## Is it efficient? An actual decision rule, not a marketing answer

ONE_TRIAL_USEFUL_NOT_PROVEN means at least one NEW, reviewer-attested actionable decision,
within the additional budget. It does not mean faster development or a better game.
NO_INCREMENTAL_VALUE is a valid outcome. Two consecutive comparable studies without new
useful decisions: shelve REA. Keep normal research and reusable templates.

Do not compare baseline minutes and extra REA minutes as though they measured identical work.
For speed, compare equal questions, matched artifacts and similarly skilled operators; separate
setup cost and account for learning/carry-over, and record total research + implementation + QA
and rework time. A practical follow-on is two or three small authorized studies, not a month of
infrastructure. Keep REA only if it either resolves an otherwise blocked useful decision or
reduces total accepted-change effort at equal quality. One good graph is not enough.

Current baseline selection: grid-merge/direct2048 source -> skip REA; FORM first three minutes
and usable-image quality -> browser/paired-image experiment; large authorized JS module-boundary
question -> the first possible REA candidate. No authorized real REA artifact/run is supplied
in this delivery, so no speedup, cost savings or commercial improvement has been claimed.

## Next work: one live compatibility smoke, then one useful study

After explicit environment/install/target approval, analyze a tiny self-owned JS directory,
verify direct export using this bridge, and preserve the real command version/exit/output.
This is an interoperability smoke test, NOT competitor research or business validation.
Then choose one permissioned complex client question that ordinary methods actually failed
to answer, keep a matched baseline and apply the limits above. If the smoke fails, fix only
the actual schema/version mismatch with a regression fixture; do not broaden all REA tools.
Until then, do not mark LIVE_REA_VERIFIED, install anything in FORM, or expand the Agent system.

## Primary references checked for this implementation

Reviewed REA source revision: `0485cd3bce29c977bae05a4fdce5436f3e3d7913`.
These files explain the contract; their presence is not an executed live integration test.

- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/src/domain/evidence.ts
- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/src/domain/canonicalDigest.ts
- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/src/application/javascript/JavaScriptApplicationEvidence.ts
- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/src/cli/electronCommands.ts
- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/src/cliObservationOptions.ts
- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/src/domain/javascript/javascriptAnalysisResourceControls.ts
- https://github.com/morluto/rea/blob/0485cd3bce29c977bae05a4fdce5436f3e3d7913/package.json
- https://developers.openai.com/codex/mcp (disabled server and tool allowlist configuration)
