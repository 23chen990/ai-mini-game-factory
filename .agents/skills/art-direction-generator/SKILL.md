---
name: art-direction-generator
description: Generate exactly four production-feasible art-direction candidates and an approval page from a validated game blueprint. Use for the factory ART_DIRECTIONS stage.
---

# Art Direction Generator

## Trigger

Use after a valid blueprint exists and before human art approval. Do not use after Style Lock, for individual asset
approval, or to generate final game assets.

## Inputs and outputs

- Input: `artifacts/game-blueprint.json` (`GameBlueprintSchema`).
- Outputs: `artifacts/art-directions.json`, `art-review/index.html`, `art-review/previews/*`, and
  `human/art-approval.example.yaml`.

## Procedure

1. Produce ids `direction_a` through `direction_d`. Make silhouette, palette, UI geometry, and scene treatment meaningfully distinct.
2. For each include keywords, hex palette, character proportion, UI/scene style, forbidden items, complexity, and a
   generator-ready original image prompt. Prefer low/medium production complexity for web-lite.
3. Create safe local SVG previews when image generation is unavailable. Render every field in a readable static page.
4. Return the candidate JSON to the Orchestrator; it owns persistence and the transition to the human gate.

## Acceptance

`ArtDirectionsSchema` passes with exactly four unique ids; every preview resolves; the review page names each id;
prompts ban known characters/logos and do not imitate a named living artist.

## Failure

Do not create fewer candidates. If previews fail, keep the stage failed rather than entering approval with broken cards.
Provider/schema failures go to the stage record and may be retried idempotently.
