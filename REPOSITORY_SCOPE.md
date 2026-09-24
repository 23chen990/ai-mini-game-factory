# Repository scope

This public repository contains the reusable AI mini-game factory workflow: its stage orchestration, schemas, provider adapters, QA gates, tests, documentation, example inputs, and shared mother templates.

Generated game runs and local evidence are intentionally outside this repository. In particular, the following are excluded from the public export:

- `runs/` workspaces, screenshots, recordings, build outputs, and provider logs
- standalone prototypes and game demos
- game-specific HTML and platform build workflows
- local board registry data, triage snapshots, and workstation memory

The `templates/` and `examples/` directories are factory inputs and reusable mother templates. They are not generated game projects or release packages. A new run copies a selected template into its own ignored `runs/<run-id>/workspace/` directory.
