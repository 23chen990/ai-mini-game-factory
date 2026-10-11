# Validation record — latest verified code and previous local evidence

## GitHub verification update (2026-10-12)

Code-fix commit: `e29ea067d151d2ab38b296426f6166fc68859855`.
Actual passing GitHub Actions run: https://github.com/23chen990/ai-mini-game-factory/actions/runs/38161723421

**offline-engineering: PASS** (51/51 native tests, 0 failed/skipped; change scope and syntax checks).
**http-browser: PASS** (locked dependencies, scoped lint, typecheck, Chromium HTTP load,
11/11 named checks and a successful report). The 320x568 regression stayed enabled.
Four layout checks, five scripted normal-input checks and two declared injected-fixture
checks passed. Do not count the fixtures as natural-play proof.
**human: NOT_RUN; commercial: NOT_RUN; publishable: false.**

The previous browser failure remains historically useful but is RESOLVED in this code commit.
Any subsequent head must receive its own test run; passing an ancestor is not a release gate.


## Two builds that must not be confused

- Original GitHub candidate (six game files):
  `a1efa3864f790360913c395de4d5dae49daadc0e0fb172ba79228268dfadfae3`.
- Locally corrected short-phone candidate:
  `a5abe420363f9fcdbe97a4dda387406bd2fc6eeb988f67e63de1f982cfabc79c`.
- The earlier attempt to upload this stylesheet was blocked; the corrected file was later
  successfully uploaded and verified in code-fix commit `e29ea067`. The fixed build
  hash above now identifies the branch runtime. Preserve evidence tied to its exact hash.
- Audited factory base: `f38d9955575db5561eba40007640c00094add885`.

## Executed locally

`npm run pilot:test`: **51 passed, zero failed/skipped** on Node 22.16.0. This includes
14 engine tests and 37 tooling/guard tests. One test checks 625 row combinations against
an independent merge oracle; another checks 20,000 seeded transition requests, including
invalid and terminal requests. These are not 20,000 human sessions or successful moves.

`npm run pilot:typecheck`: passed with TypeScript 5.8.3. New module syntax was also checked
with `node --check`. Source excerpts and license bytes were hashed and their quote anchors
verified. Excerpt hashes are not represented as hashes of the full upstream file.

The six offline DOM checks passed on the locally corrected build: four screen/theme layouts,
normal touch input producing movement/merge, and normal keyboard progression to loss/replay.
The latest recorded normal terminal was 95 moves; no terminal state was injected. The
320x568 correction was visually inspected after a failing first-viewport regression.
The previous remote stylesheet failed that stronger small-screen assertion; the new remote stylesheet passes it.

Local browser environment: Chromium 144.0.7559.96, preinstalled Playwright core
1.57.0-beta-1764944708000. This is not the repository's locked Playwright version.
Offline checks use setContent with the owned exported HTML, not HTTP navigation. Storage
is unavailable on that opaque origin and the UI exposes the warning; storage success was
not mocked. See local-verification.json for exact local build and log hashes.

## Repairs backed by regressions

This completion pass adds 12 native tests to the previous 39. Browser reports now require
a frozen suite identity, every required named check and hash-matching screenshot artifacts.
Incomplete/contradictory reports cannot pass. Changed frozen inputs and source bytes make
old evidence stale. Export rejects missing/repeated HTML markers and unexpected imports.
A scoped change guard rejects unrelated factory files and changes to old package behavior.
Three newly added tests were run failing before the corresponding fixes, then passing.

A separate layout assertion failed at 320x568, then passed after the LOCAL style correction.
That correction is now on GitHub and passed full HTTP CI with the stricter assertion unchanged.
The complete-02 run was created because browser acceptance was strengthened; the before/after
CSS builds within that same run consume two distinct candidate slots. Earlier failures
remain in the local record. Fresh IDs must not be used to hide failed product revisions.

## Failed or not verified

Local-HTTP browser QA was attempted and hit `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
No local browser policy was modified. **GitHub's separate Chromium HTTP CI later passed**, including
real-origin persistence. Safari/WebKit, iPhone hardware, original-reference field play,
uncoached humans, retention, ads, platform packages, model quality and profitability remain
NOT verified. The distinction between local failure and remote success is intentional.
The old factory's full lint/typecheck/test suite and PR #1 were not rerun locally.

The new GitHub workflow has separate native and HTTP-browser jobs and uploads narrow
synthetic artifacts. Run 38161723421 passed on code-fix commit e29ea067; verify the CI for any newer
head rather than assuming ancestor results remain valid. Passing HTTP QA still does not prove human enjoyment or release readiness.
No REA, model, payment, deployment or FORM business code execution is part of these checks.
Local integrity checks are auditable safeguards, not protection against an operator forging
all files and metadata together. Human records still need independent reviewer attestation.
