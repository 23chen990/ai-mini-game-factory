# Native player QA: V11 default and historical V10 mode

Run from the repository root:

```sh
node tools/lean-pilot/racing-native-player-qa.mjs
```

The default checks the current V11.5 generated game in
`runs/h5-qq-mobile-20261013/workspace/source/qq-speed` and writes
`runs/h5-qq-mobile-20261013/artifacts/racing-v115-native-player/native-player-physics.json`.
It verifies generated PlayerCar, Track and AICar hashes against the build receipt,
imports the generated V11 layouts directly, and uses the shipped
`ManualRaceDriver` for every moving step.

These are deterministic native physics fixtures with declared initial positions,
headings and speeds. They do not claim to be human play, visible mobile QA, a
six-car race, a campaign completion, or a difficulty/win-rate measurement. The
scripts do not change production controls, physics, distance, rank or difficulty.

## Current physical checks

Each of stages 01, 07 and 22 runs the following four checks:

| Check | Required behavior |
| --- | --- |
| Held drift with opposite wheel | Real native heading separation remains at least 0.17 radians. |
| Corrected release and explicit small spray | Releasing and countersteering ends a real clean drift; one subsequent tap triggers exactly one native small boost. The uncorrected late-drift control still crashes and receives no clean spray window. |
| Wall contact and drift rearm | A real wall crash reduces the declared 32 m/s start speed. Holding the old drift touch cannot restart drift; releasing and pressing again can. |
| Pause and resume | The exact generated native `Game.loop` performs zero physics steps while paused; pending/held touch actions clear and do not replay on resume. |

Failures are written to the report and produce a nonzero exit code. Independent
existing native boost tests also cover late non-perfect sprays, one-shot nitro
at 144 Hz input/120 Hz physics, and separate earned nitro/item controls.

## Why the older AI comparisons are separate

The old script compared original and reshaped V3–V10 geometry using a spline
`AICar`, a writable `bot.dist`, virtual personal lanes, and guided/late synthetic
driver timing gaps. V11 replaces that controller with a real `PlayerCar` and
uses native World checkpoints and terminal rules. Those numerical comparisons
do not describe the same controller or race semantics and are not reused as
V11 pass criteria.

The complete old checks remain in `racing-native-player-legacy-qa.mjs`:

```sh
node tools/lean-pilot/racing-native-player-qa.mjs --legacy-v10
```

This mode requires the matching historical V10 generated workspace. It rejects
the current V11 layout adapter. The V11 report records these comparisons as
`NOT_APPLICABLE_TO_V11`; they are never counted as passed or silently removed.

The separate `racing-ai-pace-audit.mjs` owns all thirty actual V11 AI courses,
native lap/finish accounting, and the single-run terminal rules for 07/22.
Natural browser input, visible AI shortcut recovery and perceptual QA remain
separate required release evidence.
