---
name: release-packager
description: Package a QA-passing web build and verified reports into a hashed release-candidate directory. Use only for the RELEASE stage.
---

# Release Packager

## Trigger

Use only after the latest validated QA report passes. Do not publish externally, create store accounts, or package a
failed/unverified build.

## Inputs and outputs

- Inputs: Blueprint, Asset Manifest, Build Report, passing QA Report, `workspace/game/dist/`.
- Outputs: `artifacts/release-manifest.json` and `release-candidate/{web,reports,marketing}/`.

## Procedure

1. Recreate only the run's release-candidate directory. Copy the current Web build and exact build/QA reports.
2. Copy declared promo/icon files, create a concise original name/description, and set `web/index.html` as entrypoint.
3. Enumerate every packaged file before the manifest and calculate SHA-256 hashes.
4. Validate the manifest, save the artifact copy, then let the Orchestrator mark the run complete.

## Acceptance

Entry point and reports are readable; marketing list resolves; hashes match bytes; `ReleaseManifestSchema` passes;
the release contains no secrets, source workspace, node_modules, or unrelated run data.

## Failure

Missing build/report/promo or hash mismatch fails packaging. Clear partial candidate output on retry and never mark
`COMPLETED` until the disk manifest and all referenced files have been verified.
