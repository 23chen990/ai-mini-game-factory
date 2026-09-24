---
name: web-lite-game-builder
description: Build the generated Phaser/Vite web-lite project from validated factory artifacts and the idle-shop template. Use only for the BUILD stage.
---

# Web-lite Game Builder

## Trigger

Use for `runtime: web-lite` with a registered template. This is one of only two skills allowed to modify
`workspace/game`. Do not redesign the Blueprint, edit source templates in place, or implement Cocos.

## Inputs and outputs

- Inputs: Blueprint, Style Lock, Asset Manifest, and the registered `templates/web-lite/<template>/` mother template.
- Outputs: `workspace/game/`, `workspace/game/dist/`, `artifacts/build-report.json`.

## Procedure

1. Ask `RuntimeAdapter.createProject` for a clean generated workspace; apply config and import only manifest assets.
2. Ensure theme, copy, balance, and paths come from generated config. Preserve the template test API contract.
   For reference adaptations, treat the validated competitor research as a behavioral contract: reproduce the
   observed action → feedback → success/failure → retry loop and its failure-pressure structure, not merely the
   competitor's surface theme or UI. Identify whether pressure comes from hazards, timing, resource loss, wrong
   choices, pursuit, collapse, or another mechanism; preserve its signaling, escalation, attribution, and recovery.
   Any physics-led interaction must make its physical result readable and attributable; for falling or cut
   objects, verify gravity, collision response, damping, stable settling, and zero 3D mesh/collider penetration.
   Use continuous collision detection or swept tests for fast bodies. Tunneling, explosive launch,
   teleporting, or arbitrary velocity injection are acceptance failures. Express critical reminders through UI
   affordances and visual state first (icons, highlights, progress/alert bands, animation, color and layout); helper
   copy is secondary and must not be the only way to understand a rule, timing, danger, outcome or recovery action.
   For level-based reference adaptations, fail the build handoff if levels only differ by a shared linear template or
   labels. Every level must declare authored beats, a pressure source, an escalation step, a recovery beat, and a
   terminal reward choice. If the contract names moving hard obstacles or multiple cuttable object classes, those must
   exist as data-driven runtime entities with tests; a static sibling object does not satisfy the contract.
   Before build handoff, run an authored-path audit for every interactive gameplay object (hazard, target, platform,
   reward, trigger, enemy, resource, or hard surface): prove a normal player path can intersect, intentionally avoid,
   or use it for recovery, or explicitly classify it as decorative with no gameplay collider. Reject interactive
   objects that are visible but unreachable, because they cannot create attributable decisions and usually indicate a
   broken path, gate, camera, or layout mismatch.
3. Treat the Zod-validated `uiAnimationStandard` in the Builder input as a versioned implementation contract.
   For HUD, menu, overlay, icon, and state transitions, prefer time-based runtime transform/opacity/mask tweens.
   Never generate separate AI images for every in-between frame. Use image frames only for genuine silhouette
   changes or deformation; when needed, use two to four aligned key poses in one sprite sheet with a stable canvas,
   camera, scale, pivot, palette, lighting, and background mode. Do not trim frames independently.
4. Preload textures/atlases before first visibility, use elapsed-time playback with per-frame durations, and never
   swap image URLs during playback. Use the supplied duration/easing tokens and implement `prefers-reduced-motion`.
5. In real mode start one Codex thread scoped to the workspace. Request only artifact-driven implementation work.
6. Run `buildWeb`; enumerate outputs; validate the report. Never claim success from Codex prose alone.
7. Verify the shipped entrypoint in a fresh browser profile (and, when supported, the exact `file://`
   self-contained HTML alias), not only through source/unit tests. Assert the first visible state is the declared
   default mode and exercise the real transition into the primary loop and its retry/replay path.
   For a reported visual or physics behavior, enumerate affected object types and lifecycle/state branches and wire
   each renderer/presentation branch to the same semantic result. Add a focused regression for every affected branch;
   do not infer coverage of one object from another object's passing test.
8. Treat persisted state as part of the runtime contract. With a stale snapshot containing every superseded
   mode/level, either migrate it explicitly or version/namespace the save key and reject incompatible snapshots;
   stale local state must never resurrect a removed default path.
9. Search the built artifact and runtime state for superseded default-path labels/IDs. A passing unit test is
   insufficient if the browser can still open an old bundled alias, restore a legacy snapshot, or route retry
   back into retired content.
10. For 3D drops and breakable structures, capture a deterministic runtime trace that includes the release pose,
    first contact, post-contact velocity, and settled pose at 30/60/120 Hz. The trace must show the same semantic
    outcome across frame rates and prove the object remains within the authored floor/platform bounds.

## Acceptance

For reference previews, read every `behaviorChecks` row in `reference-fidelity-contract.json`, including its
source locator, exact object/state, player input, spatial relationship, feedback anchor/order and viewport.
Preserve `mustPreserveMechanics`, progression and unlock rules as separate requirements. Do not substitute an
unlock rule for failure/recovery or a list of objects for their interaction relationships. Build one representative
playable journey first; expanding a level pack before this journey is accepted does not close fidelity gaps.
The independent comparison in `reference-fidelity-review.json` belongs to QA/HumanReviewer, never Builder/Fixer.

Vite exits zero; `dist/index.html` exists; build report passes Schema and records files/thread id; gameplay source has
all seven `__GAME_TEST__` functions and a versioned local save. Focused UI tests prove equivalent semantic final
states at 30/60/120 Hz, preload-before-playback, and the reduced-motion fallback whenever animated UI is present.
Runtime evidence must also include fresh startup, default-mode assertion, primary-loop entry, terminal settlement,
retry/replay, and stale-save rejection/migration. Record the exact artifact path opened during the browser check.

## Failure

Record command output and exit code, do not emit a successful report, and preserve the workspace for inspection.
Retry recreates the workspace from template so prior partial changes cannot leak.
