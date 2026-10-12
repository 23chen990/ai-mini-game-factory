---
name: seed-to-game-blueprint
description: Convert a validated mini-game factory seed.yaml into the structured game-blueprint.json artifact. Use only for the factory BLUEPRINT stage.
---

# Seed to Game Blueprint

## Trigger

Use when the Orchestrator enters `BLUEPRINT` for a run whose seed selects a supported template. Do not use to
write game code, invent an unsupported runtime, revise an approved style, or plan a standalone game outside this factory.

## Inputs and outputs

- Input: `runs/<run-id>/input/seed.yaml`, validated with `SeedSchema`, plus the approved primary experience profile.
- Output: `runs/<run-id>/artifacts/game-blueprint.json`, validated with `GameBlueprintSchema`.
- When a gameplay work order is supplied, use its profile/case tags and request binding. It is a preflight artifact,
  NOT a replacement for the frozen pipeline plan, an approved seed or any existing Zod artifact.

## Procedure

1. Preserve title, theme, template, and preferences. Select only the runtime implied by the template registry.
   A missing/unvalidated template is a research/prototype gap, not permission to silently use idle-shop-v1.
2. If the seed is a reference adaptation, require the validated reference evidence and failure/recovery or ending contract.
   Keep observations, source-derived findings, design hypotheses and unknowns separate. Use lawful REA/source analysis
   when helpful to understand the actual rules; never infer player enjoyment or server secrets from static output.
3. Express ONE primary experience loop. Select the applicable guidance from `gameplay-loop-review/references/profiles.json`:
   - ACTION_FEEL: player input, movement/collision where applicable, visible response, understandable loss and learned retry.
   - STRATEGIC_SYSTEM: demand, scarce capacity/resources, a decision, visible outcome and a meaningful next decision.
     Customer/production/delivery/reward/upgrade is an example for a shop, NOT a required loop for every game.
   - NARRATIVE_AGENCY: understood context, choice, observable consequence, continuity and next-scene expectation or satisfying ending.
   - PUZZLE_CLARITY: learnable rule, decision, state change, insight and a fair next challenge or ending.
   Require classification when the profile is unclear. At most one secondary profile may add tests; explain its interaction.
4. For level-based games, preserve the approved level-variation contract and every required reachable interaction.
   During a first core experiment, implement the agreed slice only. Four distinct archetypes belong to approved content
   expansion when required by that contract, not a universal prerequisite for every prototype or narrative chapter.
   For every authored interactive gameplay object (hazard, target, platform, reward, trigger, enemy, resource, or
   hard surface), declare `pathRole` (`main`, `branch`, `recovery`, or `decorative`), the reachable path/state window,
   and the player decision it is intended to change. Reject orphan content. Use narrative states for non-spatial choices.
5. Supply original content and bounded numerical hypotheses only where the selected mechanics use them.
   Do not invent a currency economy for a finite story or force metagame progression into a one-session puzzle.
   Persistent games must explain what survives and how it affects the next core interaction; do not build a whole
   metagame before the small loop works. Never change a frozen schema or contract just to make this guidance fit.
6. Return the existing schema's JSON only. Let the Orchestrator validate and atomically persist it; never write the game
   workspace. If the current schema/adapter cannot represent the chosen experience, report the capability gap explicitly.

## Acceptance

The existing Schema passes; the selected template exists; content expression is original and profile-appropriate.
Economy values obey the approved bounds when an economy exists. For reference adaptations, the blueprint links the
reference contract and applicable level/choice cases. Every declared causal effect maps to an implemented state branch
and player-visible signal. A field checklist cannot prove the game's core loop is good.

## Failure

On invalid seed, missing evidence or unsupported template/profile, report a structured stage error without partial output.
On provider output validation failure, preserve the raw provider error in the stage log and stop for explicit retry.
Do not rewrite historical frozen plans, invent supporting observations, or substitute an unrelated implemented template.
