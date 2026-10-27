# Research image-budget recovery — 2026-10-27

## Evidence-first diagnosis

The 2026-10-26 authorized new-reference run `20261026104326-reference-9094c978` supplied 19 contact sheets and 57 detail frames to one actual Codex Research call. Its sole reported completed turn used 683,321 tokens versus a configured 120,000-token invocation cap. Because telemetry appeared after work completed, the budget guard stopped the run but did not prevent that overshoot. The output was rejected, and no Research, Builder, QA or Fixer result was accepted.

## Changes in this PR

- **Single bounded selection policy in both Research entry points** (fresh reference intake AND legacy reference-behavior analysis), rather than fixing only one caller. The first pass now selects one contact sheet and three sampled detail frames; total incoming visual files are limited to four, including reviewed original image sources.
- Frame manifest, original evidence, timestamps and SHA-256 identities remain complete and unmodified. Separate `artifacts/reference-intake-media-plan.json` and `artifacts/reference-behavior-media-plan.json` show the selected subset, source manifest hash and number of images *not* visually inspected.
- The model is explicitly told that metadata for omitted frames does not prove visual observation. Critical unseen gameplay or terminal states remain unknown; it must not hallucinate a complete gameplay chain.
- The sandbox now admits user-supplied original image sources only if their exact relative path and SHA-256 are present in the verified `artifacts/reference-intake-evidence.json`. Other incoming media stays blocked.
- Synthetic regression covers 292 frames/19 sheets, an actual Factory reference-intake route, and direct image binding.

## Limits and one-time delivery decision

The four-image limit is an **input admission** cap, NOT an absolute token/price guarantee. High-resolution contact sheets, model reasoning and delayed usage reporting can still consume more than expected. A live authorized retry is still needed to prove the new model actually finishes Research; this PR does not repair or regenerate the legacy slice game.

Follow-up evidence: the fresh authorized Run `20261027032048-reference-9094c978` supplied seven sandboxed images but the Codex CLI invocation omitted `--image`; its only completed turn reported 294,444 tokens against a 120,000-token allowance. The output was rejected and the receipt remained `uncertain`. This local correction attaches only the selected hash-bound images and admits a smaller initial sample; tests do not prove a paid run will finish. The historical receipt is not cleared. Actual provider monetary spend remains unavailable under the local zero-rate accounting card, so no second paid invocation was made.

Do not restart the old run with an `uncertain` receipt; leave its evidence intact. Once CI passes and a user-authorized budget exists, create a fresh normal `new-reference` run with existing legally approved source material. Run one bounded Research invocation, inspect the generated source-bound plan/draft automatically, and only ask for the required reference-direction approval once a complete proposed core contract is available. If missing segments are essential, request specific frames/time ranges instead of blindly rerunning the same large call.

After a valid reference lock, make Codex complete the normal single core-slice Builder → independent natural/temporal QA → directed Fixer (if a real defect exists) → retest sequence. For every failure retain exact SHA, browser trace/video and observed per-call token lower bounds. Do not silently substitute a mock or claim a green CI is player acceptance.

User involvement should be concentrated at: **(1)** proof-of-rights/source and product-direction approval, **(2)** one final human playtest and commercial/platform authorization where actually required. Repetitive technical checks, screenshot collection, CI and deterministic regression are the Factory's responsibility.

## Verification

Initial GitHub CI (before the error-text compatibility fix) ran 193 test files / 1,238 tests: 1,237 passed, one legacy unsafe-media error-message assertion failed. The path remains forbidden; its error now preserves the prior `reference evidence` wording. Run the full CI on the corrected exact head before merge. Stacked PR order: main ← #73 ← #74 ← #75 ← #76 ← this PR. No game source, prior run state, owner recording or original failure evidence was modified.
