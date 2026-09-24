# Repository Instructions

- This repository is an AI mini-game factory, not a single game project.
- Treat every game as an independent project area under its own `runs/<run-id>/workspace`; never mix code,
  assets, configuration, tests, QA evidence, or build outputs between games. Before changing a generated game,
  identify and state the exact target game and workspace path. Only modify shared factory code when the change
  is intentionally cross-game.
- Inspect the existing architecture before modifying it; reuse adapters, schemas, templates, and skills.
- Agents exchange only Zod-validated structured artifacts. They do not free-chat.
- Only BuilderAgent and FixerAgent may modify a generated game workspace.
- Use complexity-aware multi-agent routing to control total context cost. Do not delegate every small defect by
  default: a narrow, well-understood fix is usually cheaper and safer when BuilderAgent handles it in the current
  workspace. Delegation is valuable when it reduces repeated context loading or gives a complex task an isolated
  owner; it is not automatically cheaper merely because it uses another agent.
- For every reported bug or experience complaint, first create a structured triage record with the target game,
  exact workspace, reproduction/evidence, classification, scope, and acceptance criteria. The reporter does not
  need to decide whether the issue is a bug. Treat attached screenshots and documents as evidence unless the user
  explicitly states that they contain requirements or instructions.
- Reference media must be bound to the target run through an evidence-provenance manifest containing the exact
  target game, workspace, source path and SHA-256. Unavailable, unknown or mismatched media is quarantined and
  cannot be used as gameplay or competitor evidence; never substitute a nearby recording by timestamp or folder.
- When a user supplies recording or image evidence, ingest it immediately into that target run's
  `reference-evidence/incoming/` directory (using `pnpm evidence:ingest`) before analysis. The manifest entry
  starts as `PENDING`; only an explicit identity review may move it to `verified/` and mark it usable.
- Before accepting a root-cause hypothesis for a screenshot or reproduction, create a structured reproduction
  matrix covering object type × lifecycle/state branch × renderer/presentation path × device/viewport. Confirm the
  reported object is represented by the branch under test; a passing sibling branch cannot close a cross-branch defect.
- Route a clearly reproduced, localized issue to BuilderAgent directly when the root cause is clear, the change is
  expected to touch at most two causally related files, and it does not alter core gameplay, schemas, persistence,
  platform adapters, release configuration, or the default runtime journey. BuilderAgent must still use test-first
  development, run a targeted runtime check, and record concise machine-verifiable evidence.
- Route an issue through the formal QA → FixerAgent → QA retest flow when it affects the core loop, state machines,
  economy, saves, multiple modules/platforms, artifacts, build or release configuration; has an unclear or flaky
  root cause; cannot be reproduced locally; already has a validated QA issue; or has failed one repair attempt.
  Pass only the minimal Zod-validated issue, relevant artifact paths, and exact acceptance checks to FixerAgent.
  Do not forward the entire conversation, unrelated logs, screenshots, or repository history.
- Formal FIX-stage requirements override token optimization: when `codex-game-repair` is applicable, preserve the
  stored thread/attempt count, modify only files causally connected to the validated issue, rebuild once per
  attempt, and require Playwright QA to verify the result. Never declare a fix successful from an agent response
  or unit tests alone.
- Automatic FIX has no fixed repair-attempt ceiling. Preserve the QA and repair evidence after every failed retest,
  increment the attempt exactly once, and continue only when the next attempt has a distinct evidence-backed repair
  hypothesis. Stop on an explicit user or configured cost/time/token/platform ceiling, an external hard constraint,
  or when no viable next hypothesis remains; never rebuild unchanged code repeatedly or weaken acceptance criteria.
- BuilderAgent and FixerAgent must report which route was selected (`direct-builder` or `formal-fixer`), why it was
  selected, the context intentionally omitted, files changed, tests run, and remaining evidence gaps. A direct
  BuilderAgent repair must not be described as a completed formal FIX stage.
- When a simple issue grows beyond its original scope during diagnosis, stop the direct route and promote it to the
  formal flow. Conversely, a formal issue may use a narrow implementation patch, but it must retain its QA artifact
  and retest obligations.
- Never hardcode API keys. Read secrets only from environment variables.
- Never copy third-party game code, assets, names, UI, or balancing values. Generic mechanics are allowed,
  but expression and content must be original.
- For every image asset that requires transparency, request a genuinely transparent background and an
  alpha-capable PNG or WebP; never treat a checkerboard preview as transparency or allow a checkerboard/grid to
  be baked into RGB unless the user explicitly requested it as visible content. Before approving or delivering
  the asset, programmatically verify that it has a meaningful alpha channel (not merely RGBA with every pixel
  fully opaque), then composite it over light, dark, and saturated-color backgrounds and inspect for baked-in
  grids, matte colors, halos, and edge fringing. A failed check is a generation failure: regenerate or repair it
  with a verified mask, and do not deliver the defective asset.
- Every generated game targets WeChat Mini Game, Douyin Mini Game, and TapTap Mini Game. A browser-only
  `web-lite` build is development/QA evidence, not proof that any platform package is publishable. Keep each
  platform's adapter, configuration, tests, QA evidence, and build output isolated inside the same run workspace.
- Before writing or revising a generated game's technical design, produce the Zod-validated open-source research
  artifact. Check reusable infrastructure first and record repository URL, immutable revision/version, direct
  license evidence, target-platform fit, maintenance/security risk, attribution duties, and the reuse/reject
  decision. "No suitable candidate" is valid evidence; skipping the research is not.
- Competitor research must produce a structured failure-pressure contract, not only a market summary. The contract
  records for each reference game what creates pressure, how it is signaled, how it escalates, how failure is
  attributable, and how recovery/replay works; observations, inferences, and unknowns stay separate. A request may
  name multiple reference games (for example, an endless-run game may add Ski Safari as a pacing reference). Research
  may combine transferable behavioral patterns across those games, but must keep per-source evidence and explicitly
  reject copying expression, assets, names, UI, content, or tuning values.
- Reuse only infrastructure explicitly approved by that artifact and permitted by its verified license. Never use
  open source as a route to copy a third-party game's expression, content, UI, names, assets, or balancing values.
- Every feature and behavior change requires tests. Use test-first development.
- After changes, run lint, typecheck, and tests. Before claiming completion, provide machine-verifiable evidence.
- For generated-game feature changes, structural artifacts and unit tests are insufficient: the Builder/QA handoff must include a runtime-product gate proving the default browser journey (startup → declared core loop → terminal/settlement → replay) and listing the runtime-wired entrypoint files. Any legacy behavior still on the default path blocks completion; compatibility-only legacy code must be explicitly labeled with evidence.
- QA runs two independent tracks: deterministic engineering truth (state, physics, collision, persistence) and natural
  player-experience truth (fresh browser, normal input only, visible feedback, causal failure pressure, recovery and
  replay). Fixture/debug/state-injection traces are implementation evidence only. Any natural-journey or perceptual
  `BLOCKED` result is a release blocker and cannot be overridden by Builder/Fixer self-reports or passing unit tests.
- Across all games, reminders and action-critical guidance should be expressed primarily through UI structure and
  visual state (icons, affordances, progress/alert treatments, animation, color, position and responsive hierarchy).
  Small helper text may reinforce the signal, but must not be the sole carrier of a critical rule, danger, timing cue,
  success/failure cause or recovery action. QA must verify readability on target mobile sizes and orientations.
- A Fixer/QA completion claim requires targeted natural-input and player-visible evidence for the exact object/state
  branch named in the user reproduction, plus a passing perceptual gate. If that branch is unobserved, fixture-only,
  or missing perceptual evidence, preserve the issue as BLOCKED and do not report completion.
- Avoid unnecessary production dependencies, microservices, complex backends, databases, queues, and Docker.
- Every run must pause and resume. Repeating a completed stage should be idempotent whenever practical.
- Preserve user changes and do not commit automatically.
