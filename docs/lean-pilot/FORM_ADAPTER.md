# FORM: reuse the evidence layer, not the game scoring rules

FORM's active business implementation and frozen specifications are not changed by this work.
Keep research on its independent research branch/PR. Findings propose an experiment or a
future decision; they do not create approved changes to V2.2.

The shared `verifyEvidence(root, manifest)` validates archived source bytes and claim locators.
FORM must additionally preserve exact App ID, developer, storefront, version, UTC capture time,
permission and consent. The common validator does not independently establish those identities,
license scope, semantic truth, review authenticity or actual provider charges.

`analyzeFormSessions(input)` in `tools/lean-pilot/form-metrics.mjs` is a pure offline function.
It accepts anonymized records, not photos or credentials. Required top-level status is RECORDED;
NOT_RUN examples are intentionally rejected. Each session records id, photoId, task
(paint/wheels/style), providerProfile and **all** attempts. An attempt includes:

```json
{
  "id": "attempt-1",
  "status": "succeeded",
  "elapsedMs": 12000,
  "costMicros": null,
  "reviewer": "anonymous-independent-reviewer",
  "quality": {
    "identity": true,
    "target": true,
    "nonTarget": false,
    "artifactFree": true,
    "keep": false
  }
}
```

This is a synthetic shape example, not an executed model call. `costMicros` is millionths of
the declared ISO currency, not user credits. null means unknown, not free. Failed, cancelled
and uncertain attempts stay in cost and attempt denominators. An image is usable only when
all five quality flags are true and status is succeeded. A missing review is not a pass.

Outputs include technical successes, usable images/sessions, failed sessions, first-attempt
usable rate, known cost, unknown-cost count, total cost and cost per usable output/session.
Conditional time/attempt averages explicitly exclude unsuccessful sessions, while failedSession
counts remain visible. Use matched authorized photos/tasks for competitor comparisons; do not
compare aggregates from different photo sets or silently omit unattractive first results.

Until budget and photo permissions are approved, only gather public evidence and prepare
NOT_RUN records. No paid experiments or monthly automation are started here. The existing
monthly report in the other account can reference reviewed GitHub research records.


`timeToFirstUsableMs` currently sums attempt durations supplied by the researcher. It is not
wall-clock time including think time and gaps; do not relabel it as such. Sessions without a
usable image include unreviewed successful returns, so `failedSessions` is not a technical
API failure rate. Analyze matched groups by provider profile/task rather than pooling
unmatched inputs. CLI: `npm run pilot:form -- /path/to/recorded-benchmark.json`.
