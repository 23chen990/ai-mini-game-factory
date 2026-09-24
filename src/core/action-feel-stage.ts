import { sha256Text } from './files.js';
import { ActionMechanicExperimentSpecSchema, ActionPlaytestReportSchema, type ActionPlaytestReport } from '../schemas/action-mechanic-experiment.js';
import { ExperienceReviewReportSchema, type ExperienceReviewReport } from '../schemas/experience-contract.js';
import { ProfileRepairTriageSchema, ProfileStageEvidenceSchema, type ProfileIndependentEvidence, type ProfileRepairTriage, type ProfileStageEvidence } from '../schemas/profile-stage.js';

type ActionFeelStageSupportInput = {
  productionLine?: string;
  template?: string;
  profile?: string;
};

/** The action-feel adapter owns one concrete line. Do this check before any
 * candidate workspace is created so another action line cannot inherit the
 * cut-stack mechanics by accident. Missing metadata is unknown and therefore
 * fails closed; the factory supplies the tuple from the locked line contract. */
export function isActionFeelProfileStageSupported(input: ActionFeelStageSupportInput) {
  const unsupported: string[] = [];
  if (input.productionLine === undefined) unsupported.push('production line missing');
  else if (input.productionLine !== 'cut-stack-dodge') unsupported.push(`production line ${input.productionLine}`);
  if (input.template === undefined) unsupported.push('template missing');
  else if (input.template !== 'cut-stack-dodge-v1') unsupported.push(`template ${input.template}`);
  if (input.profile === undefined) unsupported.push('profile missing');
  else if (input.profile !== 'ACTION_FEEL') unsupported.push(`profile ${input.profile}`);
  return unsupported.length === 0;
}

function assertActionFeelProfileStageSupported(input: ActionFeelStageSupportInput) {
  if (!isActionFeelProfileStageSupported(input)) {
    const details = [input.productionLine, input.template, input.profile].filter((item): item is string => item !== undefined).join(', ');
    throw new Error(`Unsupported action-feel cut-stack profile combination: ${details}`);
  }
}

type ActionFeelEvidenceInput = {
  naturalPlayEvidence?: ProfileIndependentEvidence;
  visualEvidence?: ProfileIndependentEvidence;
  perceptualEvidence?: ProfileIndependentEvidence;
  evidence?: {
    naturalPlay?: ProfileIndependentEvidence;
    visual?: ProfileIndependentEvidence;
    perceptual?: ProfileIndependentEvidence;
  };
  selectedCandidate?: {
    slot: 'A' | 'B' | 'C';
    workspace: string;
    targetRunId: string;
    targetGame: string;
    experimentId: string;
  };
};

function evidenceFor(input: ActionFeelEvidenceInput, key: 'naturalPlay' | 'visual' | 'perceptual') {
  if (key === 'naturalPlay') return input.naturalPlayEvidence ?? input.evidence?.naturalPlay;
  if (key === 'visual') return input.visualEvidence ?? input.evidence?.visual;
  return input.perceptualEvidence ?? input.evidence?.perceptual;
}

function evidencePasses(gate: ProfileIndependentEvidence | undefined, kind: 'naturalPlay' | 'visual' | 'perceptual', selectedCandidate?: ActionFeelEvidenceInput['selectedCandidate']) {
  if (!gate || gate.passed !== true || !Array.isArray(gate.evidence) || gate.evidence.length === 0 || (Array.isArray(gate.blockers) && gate.blockers.length > 0) || gate.fixtureOnly === true) return false;
  if (!gate.targetRunId || !gate.targetGame || !gate.targetWorkspace || !gate.experimentId) return false;
  if (!gate.buildHash) return false;
  if (selectedCandidate) {
    const selectedWorkspace = selectedCandidate.workspace.replaceAll('\\', '/');
    const expectedWorkspace = `workspace/feel-prototype-${selectedCandidate.slot.toLowerCase()}`;
    if (gate.targetRunId !== selectedCandidate.targetRunId
      || gate.targetGame !== selectedCandidate.targetGame
      || gate.targetWorkspace !== selectedCandidate.workspace
      || gate.experimentId !== selectedCandidate.experimentId
      || (selectedWorkspace !== expectedWorkspace && !selectedWorkspace.endsWith(`/${expectedWorkspace}`))) return false;
  }
  if (kind === 'naturalPlay') {
    return gate.freshContext === true
      && gate.naturalInput === true
      && gate.replayObserved === true
      && (gate.completion === 'terminal' || gate.completion === 'settlement');
  }
  if (kind === 'visual') return gate.playerVisible !== false;
  return gate.playerVisible === true && gate.authorIndependent === true;
}

export function buildActionFeelStageSpec(input: {
  runId: string;
  sourceWorkspace: string;
  representativeFlow: readonly string[];
  targetGame: string;
  productionLine?: string;
  template?: string;
  profile?: string;
}) {
  assertActionFeelProfileStageSupported(input);
  const targetGame = input.targetGame.trim();
  if (!targetGame) throw new Error('Action-feel target game title is required');
  const geometryFixtureHash = `sha256:${sha256Text(JSON.stringify({
    line: 'cut-stack-dodge',
    flow: input.representativeFlow,
    fixtureVersion: 1,
  }))}`;
  const variant = (slot: 'A' | 'B' | 'C', treatment: string[]) => ({
    slot,
    name: `${targetGame}·手感候选 ${slot}`,
    workspace: `workspace/feel-prototype-${slot.toLowerCase()}`,
    geometryFixtureHash,
    treatmentHash: `sha256:${sha256Text(JSON.stringify({ slot, treatment }))}`,
    hypothesis: '一次输入应立即产生可读的运动与接触后果，并能快速重试。',
    treatment,
  });
  return ActionMechanicExperimentSpecSchema.parse({
    schemaVersion: 1,
    experimentId: `feel-${input.runId}`,
    question: '在保持同一关卡几何的情况下，哪种原创动作反馈最能让玩家读懂切割、支撑、危险和重试？',
    coreAction: `The primary input resolves the declared flow (${input.representativeFlow.join(' → ')}) with immediate motion and an attributable consequence.`,
    decisionIntervalMs: 900,
    sourceWorkspace: input.sourceWorkspace,
    sharedGeometryFixture: `locked-geometry-${geometryFixtureHash}`,
    constraints: { greyboxOnly: true, chaseIncluded: false, formalUiIncluded: false, iaaIncluded: false },
    prototypes: [
      variant('A', ['短促切入反馈', '接触瞬间冻结 80ms', '高对比危险边缘']),
      variant('B', ['柔和预警弧线', '接触后轻微回弹', '失败原因锚定危险物']),
      variant('C', ['节奏脉冲提示', '支撑与切割颜色分离', '重试输入保持在首屏']),
    ],
    automaticQaThresholds: {
      inputResponseMs: { max: 120 },
      releaseVelocityRetentionRatio: { min: 0.85 },
      wrongHookAttachments: { max: 0 },
      maxEventGapMs: { max: 900 },
      retryFrictionMs: { max: 250 },
      missedFinishDetections: { max: 0 },
    },
  });
}

export function buildProfileStageEvidence(input: {
  stage: ProfileStageEvidence['stage'];
  targetRunId: string;
  targetGame: string;
  targetWorkspace: string;
  sourceArtifacts: ProfileStageEvidence['sourceArtifacts'];
  checks: ProfileStageEvidence['checks'];
  independentEvidence?: ProfileStageEvidence['independentEvidence'];
}) {
  const passed = input.checks.every((check) => check.passed);
  return ProfileStageEvidenceSchema.parse({
    schemaVersion: 1,
    stage: input.stage,
    targetRunId: input.targetRunId,
    targetGame: input.targetGame,
    targetWorkspace: input.targetWorkspace,
    profile: 'ACTION_FEEL',
    productionLine: 'cut-stack-dodge',
    status: passed ? 'READY' : 'BLOCKED',
    sourceArtifacts: input.sourceArtifacts,
    checks: input.checks,
    ...(input.independentEvidence ? { independentEvidence: input.independentEvidence } : {}),
    createdAt: new Date().toISOString(),
  });
}

export function buildActionFeelExperienceReview(input: {
  contractId: string;
  playtest: ActionPlaytestReport;
} & ActionFeelEvidenceInput): ExperienceReviewReport {
  const playtest = ActionPlaytestReportSchema.parse(input.playtest);
  const allPassed = playtest.results.every((result) => Object.values(result).every((value) => typeof value === 'object' && value !== null && 'passed' in value ? (value as { passed: boolean }).passed : true));
  const recommendationPassed = playtest.recommendation !== 'NONE';
  const naturalPassed = evidencePasses(evidenceFor(input, 'naturalPlay'), 'naturalPlay', input.selectedCandidate);
  const visualPassed = evidencePasses(evidenceFor(input, 'visual'), 'visual', input.selectedCandidate);
  const perceptualPassed = evidencePasses(evidenceFor(input, 'perceptual'), 'perceptual', input.selectedCandidate);
  const passed = allPassed && recommendationPassed && naturalPassed && visualPassed && perceptualPassed;
  const issues: ExperienceReviewReport['issues'] = [];
  if (!allPassed || !recommendationPassed) issues.push({
    id: 'action-feel-thresholds',
    severity: 'major',
    category: 'natural-play',
    evidence: 'Independent action-feel engineering QA did not produce a passing recommendation across all six thresholds.',
  });
  if (!naturalPassed) issues.push({
    id: 'action-feel-natural-evidence',
    severity: 'blocker',
    category: 'natural-play',
    evidence: 'Fresh natural input, terminal/settlement and replay evidence is missing, fixture-only, stale or blocked.',
  });
  if (!visualPassed) issues.push({
    id: 'action-feel-visual-evidence',
    severity: 'blocker',
    category: 'readability',
    evidence: 'At least two readable player-visible action captures are required; blank or missing screenshots cannot pass.',
  });
  if (!perceptualPassed) issues.push({
    id: 'action-feel-perceptual-evidence',
    severity: 'blocker',
    category: 'readability',
    evidence: 'An independent perceptual review with player-visible evidence is required before action-feel approval.',
  });
  return ExperienceReviewReportSchema.parse({
    schemaVersion: 1,
    contractId: input.contractId,
    statuses: {
      mechanics: passed ? 'PASS' : 'FAIL',
      feel: allPassed && recommendationPassed ? 'PASS' : 'FAIL',
      naturalPlay: naturalPassed ? 'PASS' : 'FAIL',
      presentation: visualPassed && perceptualPassed ? 'PASS' : 'FAIL',
    },
    oracleDetected: false,
    issues,
    decision: passed ? 'APPROVED' : 'FEEL_REPAIR_REQUIRED',
  });
}

export function buildActionFeelRepairTriage(input: {
  targetRunId: string;
  targetGame: string;
  targetWorkspace: string;
  sourceArtifacts: ProfileRepairTriage['evidence'];
  repairAttempt?: number;
  repairHypothesis?: string;
}) {
  return ProfileRepairTriageSchema.parse({
    schemaVersion: 1,
    stage: 'FEEL_REPAIR',
    targetRunId: input.targetRunId,
    targetGame: input.targetGame,
    targetWorkspace: input.targetWorkspace,
    issueId: 'action-feel-thresholds',
    classification: 'threshold',
    scope: [
      'workspace/feel-prototype-a/dist/index.html',
      'workspace/feel-prototype-b/dist/index.html',
      'workspace/feel-prototype-c/dist/index.html',
      'artifacts/action-feel-natural-play-qa.json',
    ],
    reproduction: {
      objectType: 'action prototype contract and fixed-step feedback',
      lifecycleBranch: 'six deterministic action scenarios',
      rendererPath: 'web-lite canvas plus window.__ACTION_TEST__',
      viewport: '390x844 portrait',
    },
    evidence: input.sourceArtifacts,
    repairHypothesis: input.repairHypothesis
      ?? `Address only the action-feel defect identified by the current evidence (repair attempt ${Math.max(1, Math.trunc(input.repairAttempt ?? 1))}), then rerun deterministic threshold checks and independent natural/perceptual QA without changing the locked geometry or acceptance thresholds.`,
    acceptanceCriteria: [
      'All three candidates expose the complete __ACTION_TEST__ v1 contract and matching geometry hash.',
      'Deterministic action-test measurements remain engineering evidence only; independent natural-input QA must separately verify the player flow.',
      'At least one candidate passes all six thresholds and receives recommendation A, B, or C.',
    ],
    createdAt: new Date().toISOString(),
  });
}
