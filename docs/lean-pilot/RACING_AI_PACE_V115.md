# V11.5 native AI completion audit

Run from the repository root after building the exact `qq-speed` project:

```sh
node tools/lean-pilot/racing-ai-pace-audit.mjs
node --test --test-isolation=none tools/lean-pilot/tests/racing-ai-pace-audit.test.mjs
```

The default audit runs all 30 numbered stages with five physical AI rivals in
the native starting slots 0, 1, 2, 4 and 5. The human player's slot 3 is absent.
Each stage uses fixed seed `2026101800 + stageNumber`, the real pre-race
`RacingCareer.begin` field and boss configuration, and the generated native
`LAYOUTS`, `Track`, `AICar`, and `PlayerCar`. This is a deterministic engineering
fixture, not a recorded human race or a measurement of player win probability.

## What the audit actually executes

The generated V11 AI is a `PlayerCar` subclass. Its `dist` property only reads
the projected position and laps that the native world has already awarded.
Consequently, advancing `AICar.update` alone cannot validate a completed lap.
The audit extracts and executes the generated `World.updateProgress`, `onLap`,
`collide`, `vel`, `pushRacer`, and `kick` methods unchanged. An older generated
world without the physical-rival branches is rejected instead of patched by
the test. The same applies to the 07/22 finish fractions.

Each frame advances the native car inputs and physics at 120 Hz, resolves real
rival contact, and invokes the actual native progress method. This corresponds
to a 120 Hz presentation cadence with one native physics step per frame. Road
wall collisions, grip, acceleration, airborne motion and earned boost effects
remain in `PlayerCar`. The generated `Track.build` boost-pad record block also
runs unchanged; only its mesh and texture constructors are replaced with
rendering stubs. It uses the generated stage theme's real pad positions and
dimensions. Physical fork entrances and exits use the generated shortcut module.

Only pre-race native `reset` calls place a vehicle. The audit never changes a
started car's position, heading, speed or progress to make it complete. Its
wrappers only observe native lap, separation and impulse calls. The native
world itself owns lap awards, including its special single-run finish handling.

Normal stages must pass the native halfway and finish checks for their actual
one, two or three lap setting. Stage 07 finishes at `0.82 * nativeTrack.length`;
stage 22 finishes at `0.84 * nativeTrack.length`. Both use one actual `onLap`
completion event and their final physical projected position is recorded.
Finishing rivals continue native driving until the whole field finishes, while
their reported metrics are frozen at their first real finish.

## Limits and interpretation

The observation limit remains **350 simulated seconds**, matching the former
audit. A vehicle that does not finish remains a DNF with its measured state;
the script does not extend the limit, rescue the car or move the finish line.
A full pass requires all five rivals on all 30 stages to finish with valid
native lap events and finite physical state. No new average-speed, wall-contact
or collision-count threshold has been introduced.

The old on-rail AI's V3.x pace-uplift bounds and strong-versus-weak lap-time
comparisons no longer describe the V11 physical controller. Those comparisons
are explicitly `NOT_COMPARABLE`/`NOT_APPLICABLE_DIFFERENT_AI_MODEL`; removing them
is not a claim of measured speed improvement. Historical reports and git history
remain historical evidence. The default command does not run a legacy mode and
does not overwrite `ai-pace-v33.json`.

The report records native wall crash/scrape emissions, physical average and peak
speed, displacement, airborne/reverse time, boost events, fork entries/exits and
actual rival contacts. **A native `kick` call is not a distinct crash.** Sustained
touching can produce very many tiny impulses across consecutive physics frames.
The report distinguishes per-racer impulse calls, contact frames, contact episode
starts and impulses above 3 m/s. That last value is the native player's crash
effect boundary and is descriptive, not an acceptance threshold. Two cars in one
contact may each receive an impulse, so summing per-racer calls counts both.

There is no human player, rendering, item pickup/weapon simulation, or
player-dependent tactical pressure in this fixture. Item stages still use the
actual item-mode input interpretation. Career timeouts, medals, economy and
player-facing win/loss outcomes are not validated here. Human QA and natural
gameplay QA remain `NOT_RUN`; this audit alone does not authorize publication.

## Reports and diagnostics

Full reports are written under
`runs/h5-qq-mobile-20261013/artifacts/racing-v3-smoke/`:

- `ai-pace-v115-<buildHashPrefix>.json` binds a complete run to its build.
- `ai-pace-v115.json` is the latest complete 30-stage report, including failures.

The report includes the build hash, build input hash, native/template source
hashes, and the audit script's own SHA-256. Core generated sources must agree
with the build receipt before simulation. Source and build hashes are checked
again afterward; a concurrent rebuild produces `STALE`, never `PASS`.

For a focused diagnostic:

```sh
node tools/lean-pilot/racing-ai-pace-audit.mjs --stages=07,22
```

A successful subset has status `PARTIAL`, not a 30-stage pass. Its report uses a
`-subset-07-22` suffix and never replaces the latest full report. Failing or stale
runs exit nonzero. The default CI command has no subset argument.
