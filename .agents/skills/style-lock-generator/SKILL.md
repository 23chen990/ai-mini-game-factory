---
name: style-lock-generator
description: Merge one human art approval with the matching candidate into an immutable style-lock.json. Use only when resuming the factory approval gate.
---

# Style Lock Generator

## Trigger

Use only when `human/art-approval.yaml` exists during resume. Do not infer approval, select a direction for the human,
request per-asset approval, or modify the game workspace.

## Inputs and outputs

- Inputs: `artifacts/game-blueprint.json`, `artifacts/art-directions.json`, `human/art-approval.yaml`.
- Output: `artifacts/style-lock.json`, validated with `StyleLockSchema`.

## Procedure

1. Validate approval and resolve `selected_direction` exactly; never silently fall back to another candidate.
2. Copy the complete selected direction. Record `keep`, `change`, and `notes` without changing their intent.
3. Apply change requests as production constraints, while retained traits remain fixed. Stamp the lock time.
4. Return JSON only; subsequent asset prompts must cite this lock, not reinterpret the review conversation.

## Acceptance

Selected id exists; candidate data remains traceable; all human lists are preserved; Schema passes; no unapproved
direction traits are mixed in.

## Failure

Missing approval remains a normal waiting state. Invalid YAML, unknown id, or conflicting instructions fail the stage
with a targeted error and leave existing artifacts untouched.
