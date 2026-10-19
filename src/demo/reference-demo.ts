/** First-party requirements-to-browser integration fixture. Not a live LLM,
 * reference-game observation, human playtest, or commercial release shortcut. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createFactory } from '../factory.js';
import { MockAgentProvider } from '../providers/mock.js';
import type { CodexProvider } from '../providers/interfaces.js';
import { ReferenceIntakeDraftSchema, type ReferenceIntakeEvidence } from '../schemas/reference-intake.js';
import { ReferenceMechanicSpecSchema } from '../schemas/reference-mechanic.js';
import { ReferenceBehaviorCheckSchema } from '../schemas/reference-fidelity.js';
import { BuildReportSchema, QaReportSchema } from '../schemas/index.js';
import { ingestReferenceMedia, reviewReferenceMediaIdentity } from '../core/evidence-provenance.js';
import { exists, sha256File, writeJsonAtomic } from '../core/files.js';
import { RuntimeProductGateSchema } from '../core/runtime-product-gates.js';

const SourceSchema = z.object({
  fixtureId: z.literal('mooncut-explicit-requirements-v1'), notice: z.string(),
  mechanics: ReferenceMechanicSpecSchema.omit({ lockedBy: true, source: true }),
  checks: z.array(ReferenceBehaviorCheckSchema.omit({ sourceRefs: true })),
  pressure: z.object({ trigger: z.string(), playerSignal: z.string(), escalation: z.string(), failureOutcome: z.string(), attribution: z.string(), recovery: z.string() }),
}).strict();

class ExplicitRequirementsFixture extends MockAgentProvider {
  override async draftReference(input: ReferenceIntakeEvidence) {
    const [source] = z.tuple([z.object({ path: z.string(), sha256: z.string(), excerpt: z.string() })]).parse(input.sources);
    const document = SourceSchema.parse(JSON.parse(source.excerpt));
    const value = ReferenceIntakeDraftSchema.parse({
      schemaVersion: 1, targetRunId: input.targetRunId, inputHash: input.inputHash,
      suggestedTemplate: 'cut-stack-dodge-v1', mechanics: document.mechanics,
      analysis: { schemaVersion: 1, targetRunId: input.targetRunId, status: 'READY',
        observations: [`The first-party document declares: ${document.notice}`], inferences: [], unknowns: [],
        behaviorChecks: document.checks.map((check, index) => ({
          ...check, sourceRefs: [{ path: source.path, sha256: source.sha256, locator: `/checks/${index} (authored requirement, not market observation)` }],
          // A Boolean authored requirement, not a measured reference-game result.
          // The independent paired review remains absent and blocks fidelity acceptance.
          comparison: {
            evidenceBasis: 'source-derived', referenceArtifact: { path: source.path, sha256: source.sha256 },
            condition: `Authored fixture branch: ${check.stateBranch}`,
            protocol: `${check.playerInput}; check ${check.expectedStateChange}; feedback order: ${check.visibleFeedback.eventOrder.join(' → ')}`,
            metric: 'authored requirement satisfied', unit: 'boolean', referenceRange: { min: 1, max: 1 }, maxDelta: 0, minimumSamples: 1,
          },
        })),
        failurePressureContract: { schemaVersion: 1, purpose: 'Keep the first-party fixture pressure requirements attributable to their document.',
          evidence: [{ id: 'fixture-pressure', competitor: 'First-party requirements fixture', sourceRefs: [source.path], observed: ['The document declares a visible hazard and one-action retry.'], inferred: [], applicability: 'adapt', applicabilityRationale: 'Exercise the existing first-party template with an explicit original specification.', rejectExpression: ['third-party names', 'assets', 'UI', 'text', 'audio', 'tuning'], confidence: 'high' }],
          rules: [{ id: 'fixture-hazard', pressureType: 'hazard', ...document.pressure, sourceEvidenceRefs: ['fixture-pressure'], implementationImplications: ['Keep hazard contact distinguishable from soft target cutting.'] }],
          noCopyBoundary: ['Only factory-owned template code and original expression are used.'] },
      },
    });
    return { value, metrics: { provider: 'explicit-requirements-fixture', model: 'no-llm', calls: 0 } };
  }
}

const templateBuilder: CodexProvider = {
  async build() { return { threadId: 'first-party-template-fixture', verificationMode: 'full', metrics: { provider: 'fixture', model: 'no-llm', calls: 0 } }; },
  async fix() { throw new Error('Engineering demo cannot invent repairs or waive failing QA; repair the factory/template with a validated issue.'); },
};

export const ReferenceDemoReportSchema = z.object({
  kind: z.literal('first-party-engineering-fixture'), runId: z.string().min(1), targetGame: z.literal('mooncut-trial'), workspace: z.string().min(1),
  llmExecuted: z.literal(false), humanAccepted: z.literal(false), commercialReleaseReady: z.literal(false),
  engineeringPassed: z.boolean(), stableResume: z.boolean(), stage: z.string().min(1), playable: z.string().min(1), playableSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  transitions: z.array(z.string()), wiredFiles: z.array(z.string()).min(1), screenshots: z.array(z.string()), remainingGaps: z.array(z.string()).min(1),
}).strict();

type Location = { root: string; repositoryRoot: string };
function demoFactory(location: Location) {
  return createFactory({ ...location, mode: 'mock', qaMode: 'playwright', enforceStageContracts: true, enforceExplicitStageContracts: true, agentProvider: new ExplicitRequirementsFixture(), codexProvider: templateBuilder });
}

export async function prepareReferenceDemo(location: Location) {
  const factory = demoFactory(location);
  const runId = await factory.newReference(path.join(location.repositoryRoot, 'examples/reference-demo/brief.json'));
  const runRoot = path.join(location.root, 'runs', runId);
  const workspace = path.join(runRoot, 'workspace/game');
  const media = await ingestReferenceMedia({ runRoot, sourcePath: path.join(location.repositoryRoot, 'examples/reference-demo/reference.json'), targetGame: 'mooncut-trial', purpose: 'design-document' });
  await reviewReferenceMediaIdentity({ runRoot, targetGame: 'mooncut-trial', workspace, id: media.id, expectedSha256: media.sha256, reviewer: 'first-party-fixture', basis: 'Factory-authored explicit requirements fixture. No third-party gameplay identity or human experience claim.' });
  await writeJsonAtomic(path.join(runRoot, 'artifacts/demo-origin.json'), { kind: 'first-party-engineering-fixture', sourceSha256: media.sha256, llmExecuted: false, humanAccepted: false });
  return { runId, targetGame: 'mooncut-trial', workspace, role: 'BuilderAgent' };
}

export async function runReferenceDemo(location: Location & { runId: string }) {
  const factory = demoFactory(location);
  const runRoot = path.join(location.root, 'runs', location.runId);
  // Explicit fixture identity is mandatory: never auto-approve an arbitrary run.
  z.object({ kind: z.literal('first-party-engineering-fixture'), llmExecuted: z.literal(false), humanAccepted: z.literal(false) }).parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/demo-origin.json'), 'utf8')));
  let state = await factory.run(location.runId);
  if (state.runKind === 'reference-intake') {
    if (state.stage !== 'WAITING_FOR_REFERENCE_APPROVAL') throw new Error(`Fixture research blocked at ${state.stage}`);
    await factory.approveReference(location.runId, { decision: 'APPROVE', notes: 'Synthetic requirements-fixture approval only; not a human experience or market-reference decision.' });
    state = await factory.resume(location.runId);
  }
  const build = BuildReportSchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/build-report.json'), 'utf8')));
  const qa = QaReportSchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/qa-report.json'), 'utf8')));
  const runtime = RuntimeProductGateSchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/runtime-product-gates.json'), 'utf8')));
  const before = { build: await sha256File(path.join(runRoot, 'artifacts/build-report.json')), stages: JSON.stringify(Object.values(state.stages).map(({ stage, attempts, providerCalls }) => ({ stage, attempts, providerCalls }))) };
  const resumed = await factory.resume(location.runId);
  const stableResume = before.build === await sha256File(path.join(runRoot, 'artifacts/build-report.json')) && before.stages === JSON.stringify(Object.values(resumed.stages).map(({ stage, attempts, providerCalls }) => ({ stage, attempts, providerCalls })));
  const playable = `${build.webBuild.replace(/\/$/u, '')}/index.html`;
  const report = ReferenceDemoReportSchema.parse({
    kind: 'first-party-engineering-fixture', runId: location.runId, targetGame: 'mooncut-trial', workspace: path.join(runRoot, 'workspace/game'),
    llmExecuted: false, humanAccepted: false, commercialReleaseReady: false,
    engineeringPassed: build.success && build.verification.includes('test:passed') && build.verification.includes('typecheck:passed') && qa.passed && runtime.passed,
    stableResume, stage: resumed.stage, playable, playableSha256: await sha256File(path.join(runRoot, playable)),
    transitions: qa.naturalFlow?.transitions.filter((transition) => transition.changed).map(({ name }) => name) ?? [],
    wiredFiles: runtime.runtimeWiredFiles, screenshots: qa.screenshots,
    remainingGaps: ['real-reference-analysis-unvalidated', 'independent-fidelity-review-required', 'human-experience-playtest-required', 'native-sdk-and-platform-qa-required'],
  });
  if (await exists(path.join(runRoot, 'human/playtest-acceptance.json'))) throw new Error('Fixture must not manufacture human experience acceptance');
  await writeJsonAtomic(path.join(runRoot, 'artifacts/reference-demo-report.json'), report);
  return report;
}
