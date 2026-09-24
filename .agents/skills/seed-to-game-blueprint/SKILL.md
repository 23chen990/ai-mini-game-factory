---
name: seed-to-game-blueprint
description: Convert a validated mini-game factory seed.yaml into the structured game-blueprint.json artifact. Use only for the factory BLUEPRINT stage.
---

# Seed to Game Blueprint

## Trigger

Use when the Orchestrator enters `BLUEPRINT` for a run whose seed selects a supported template. Do not use to
write game code, invent an unsupported runtime, revise an approved style, or plan a standalone game outside this factory.

## Inputs and outputs

- Input: `runs/<run-id>/input/seed.yaml`, validated with `SeedSchema`.
- Output: `runs/<run-id>/artifacts/game-blueprint.json`, validated with `GameBlueprintSchema`.

## Procedure

1. Preserve title, theme, template, and preferences. Select only the runtime implied by the template registry.
2. If the seed is a reference adaptation, require the validated competitor failure-pressure contract as an input. Keep observations, inferences, and unknowns separate; do not convert an unmeasured competitor detail into a copied value.
3. Express one short original concept and a loop that includes customer, production, delivery, reward, and upgrade.
4. For level-based games, emit a level-variation contract before implementation: at least four distinct level archetypes, per-level pressure source, signal, escalation, failure attribution, recovery/replay, terminal reward choice, and target duration. A list of named mechanics is not sufficient.
   For every authored interactive gameplay object (hazard, target, platform, reward, trigger, enemy, resource, or
   hard surface), also declare `pathRole` (`main`, `branch`, `recovery`, or `decorative`), the reachable path/state
   window, and the player decision it is intended to change. An object without a reachable path window and decision
   impact is rejected as orphan content.
5. Supply content nouns and integer balance values. Keep a three-minute-session MVP; do not add metagame systems.
6. Return JSON only. Let the Orchestrator validate and atomically persist it; never write the game workspace.

## Acceptance

The Schema passes; the template exists; every content string is theme-specific; starting currency is nonnegative and
reward/cost are positive; no third-party names or copied balance tables appear. For reference adaptations, the
blueprint must link the failure-pressure contract and level-variation contract, and each declared pressure must map to
at least one authored level beat and one player-visible signal.

## Failure

On invalid seed or unsupported template, report a structured stage error without partial output. On provider output
validation failure, preserve the raw provider error in the stage log and stop the stage for explicit retry.
