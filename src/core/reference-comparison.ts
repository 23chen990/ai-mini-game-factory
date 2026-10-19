import type { ReferenceBehaviorCheck, ReferenceFidelityContract, ReferenceFidelityGateSchema } from '../schemas/reference-fidelity.js';
import type { ReferenceComparisonCapture, ReferenceDifference } from '../schemas/reference-comparison.js';
import { ReferenceComparisonTaskSchema } from '../schemas/reference-comparison.js';

export const REFERENCE_COMPARISON_RESEARCH_INSTRUCTION = 'Choose acquisition by the unmet claim: read complete readable source directly; use REA for packaged/minified/native artifacts or questions source inspection cannot answer, then corroborate behavior with actual normal-input observation. REA exit success is not mechanism accuracy. Each behaviorCheck must supply comparison with evidenceBasis (runtime-observed, source-derived, inferred, unknown), a source-bound referenceArtifact, exact condition and protocol, metric/unit, evidence-backed referenceRange, justified maxDelta and minimumSamples. These fields are the shared Builder/QA contract, not candidate-selected expectations. Never invent measurements or relax tolerance to fit the candidate; keep unsupported mechanisms explicitly unknown/BLOCKED. Perceptual quality and human acceptance remain separate from numeric comparison.';

export function referenceComparisonNextStage(differences: ReferenceDifference[]) {
  if (differences.some(({ route }) => route === 'RESEARCH' || route === 'CONTRACT')) return 'REFERENCE_DEEP_RESEARCH';
  if (differences.some(({ route }) => route === 'QA')) return 'QA';
  if (differences.some(({ route }) => route === 'BUILDER')) return 'FIX';
  return 'QA'; // Other fidelity/perceptual blockers still belong to independent QA.
}

export function buildReferenceComparisonTask(input: {
  workspace: string; inputArtifacts: string[]; gate: ReturnType<typeof ReferenceFidelityGateSchema.parse>;
}) {
  const differences = input.gate.differences ?? []; // Older gate artifacts predate discrepancy attribution.
  const stage = referenceComparisonNextStage(differences);
  const route = {
    REFERENCE_DEEP_RESEARCH: { owner: 'ResearchAgent', instructions: [
      '只围绕 differences 指定的机制补充研究；区分实际观察、源码/逆向证据、推断和未知。优先复用未失效的参考证据。',
      '修正有证据支持的 comparison 测量协议、范围和容差；不得为候选放宽标准。更新来源绑定及合同版本，失效旧合同派生的实现/QA，重新交接 Builder 和独立 QA。',
    ] },
    FIX: { owner: 'FixerAgent', instructions: [
      '按正式 QA → Fixer → QA 流程，将 differences 及其合同/双端证据转换为经过现有 QA schema 校验的问题；只修因果相关文件。',
      '读取 codex-game-repair 技能，保留原 Builder 线程和累计尝试次数，每次独立假设修复后构建一次；禁止修改合同标准或参考测量来通过验收。修复后重新采集候选并由独立 QA 对照。',
    ] },
    QA: { owner: 'QAAgent', instructions: [
      '由独立 QAAgent 或 HumanReviewer 执行；Builder/Fixer 不得自签。读取 game-playtest 技能，只读两端游戏，写本 run 的 QA 证据。',
      '先观察参考的完整核心片段，再检查合同和候选：优先找决定玩法的组合关系，例如目标分组/间距与运动路径、连续回报、风险和恢复的先后。按相同操作意图对照，不能只重放相同时间间隔或统计通关。保留反例，不把布局或美术不同直接判错。',
      '按 src/schemas/reference-comparison.ts 的 ReferenceComparisonCaptureSchema 分别生成参考/候选 capture JSON。绑定 targetRunId、contractHash；reference.artifactHash 绑定 comparison.referenceArtifact.sha256，candidate.artifactHash 绑定当前 buildHash。',
      '合同之外的关键参考观察也写入 capture.observations，使用独立 checkId、条件、协议、实测样本和截图；它们是待核对的合同缺口，不是自行批准的新要求。没有实测值时保留 evidence gap，不编造数字。复用已有研究并核对旧差异/延期的来源与当前版本；不得默默丢弃，也不得把旧缺陷直接判为当前缺陷。',
      '两端都从 fresh reset 使用正常输入，记录 actions、durationMs、正常操作权限和真实截图 SHA-256；逐项记录精确对象/状态分支/视口及合同 condition/protocol/metric/unit 的实测样本。缺分支、样本不足或状态注入不能通过。',
      '按 src/schemas/reference-fidelity.ts 的 ReferenceFidelityReviewSchema 写入 artifacts/reference-fidelity-review.json；comparison.reference 和 comparison.candidate 分别填写 capture 文件的 run-relative path 和实际 SHA-256。contractHash 是规范化合同 JSON 的 SHA-256。',
      '独立检查玩家可见状态、空间关系、反馈绑定和事件顺序；cases 的截图与 NaturalFlowEvidenceSchema trace 必须真实存在并绑定当前 buildHash/视口，transitions.name 使用 checkId，包含结算及重玩。',
      '不得复制预期值充当观察。保留缺失证据与未通过的感知结果；数字通过或文件哈希不能替代画面审查。',
    ] },
  }[stage];
  return ReferenceComparisonTaskSchema.parse({
    schemaVersion: 1, targetRunId: input.gate.targetRunId, workspace: input.workspace,
    contractHash: input.gate.contractHash, buildHash: input.gate.buildHash,
    stage, owner: route.owner, execution: 'waiting-handoff', inputArtifacts: input.inputArtifacts,
    blockers: input.gate.blockers, differences, instructions: route.instructions,
  });
}

type ComparisonContract = Pick<ReferenceFidelityContract, 'behaviorChecks' | 'provenance'>;

/** Legacy/external contracts can omit a protocol or retain unconfirmed claims. */
function inspectComparisonContract(contract: ComparisonContract) {
  const checks: Array<{ check: ReferenceBehaviorCheck; spec: NonNullable<ReferenceBehaviorCheck['comparison']> }> = [];
  const differences: ReferenceDifference[] = [];
  for (const check of contract.behaviorChecks) {
    const spec = check.comparison;
    if (spec === undefined) { differences.push({ checkId: check.id, route: 'CONTRACT', reason: 'measurement-protocol-missing' }); continue; }
    if (spec.evidenceBasis === 'inferred' || spec.evidenceBasis === 'unknown') { differences.push({ checkId: check.id, route: 'RESEARCH', reason: 'mechanism-not-confirmed' }); continue; }
    if (!contract.provenance.some(source => source.path === spec.referenceArtifact.path && source.sha256 === spec.referenceArtifact.sha256)) {
      differences.push({ checkId: check.id, route: 'RESEARCH', reason: 'reference-artifact-unbound' }); continue;
    }
    checks.push({ check, spec });
  }
  return { checks, differences };
}

/** Research must resolve these gaps before Builder; QA enforces the same bar. */
export function referenceComparisonContractDifferences(contract: ComparisonContract): ReferenceDifference[] {
  return inspectComparisonContract(contract).differences;
}

/** Compare independently captured observations, never candidate-authored expectations. */
export function compareReferenceCaptures(input: {
  contract: ReferenceFidelityContract; contractHash: string; buildHash: string;
  reference: ReferenceComparisonCapture; candidate: ReferenceComparisonCapture;
}): ReferenceDifference[] {
  const { checks, differences } = inspectComparisonContract(input.contract);
  const add = (checkId: string, route: ReferenceDifference['route'], reason: string) => differences.push({ checkId, route, reason });
  for (const target of ['reference', 'candidate'] as const) {
    const capture = input[target];
    if (capture.target !== target || capture.targetRunId !== input.contract.targetRunId || capture.contractHash !== input.contractHash) {
      add('*', 'QA', `${target}:identity-or-contract-mismatch`);
    }
    if (capture.authority !== 'normal-input' || !capture.startedFromReset || capture.forbiddenOperations.length || capture.actions.length === 0) {
      add('*', 'QA', `${target}:natural-input-required`);
    }
  }
  if (input.candidate.artifactHash !== input.buildHash) add('*', 'QA', 'candidate:build-mismatch');
  if (differences.length) return differences;

  // External QA can discover a core behavior missing from the active contract.
  // Preserve it for contract review instead of letting the known checks hide it.
  const declaredIds = new Set(input.contract.behaviorChecks.map(check => check.id));
  for (const row of input.reference.observations) {
    if (!declaredIds.has(row.checkId)) add(row.checkId, 'CONTRACT', 'reference-observation-outside-contract');
  }
  for (const row of input.candidate.observations) {
    if (!declaredIds.has(row.checkId) && !input.reference.observations.some(reference => reference.checkId === row.checkId)) {
      add(row.checkId, 'QA', 'candidate-observation-without-reference-check');
    }
  }

  for (const { check, spec } of checks) {
    if (spec.referenceArtifact.sha256 !== input.reference.artifactHash) {
      add(check.id, 'RESEARCH', 'reference-artifact-unbound'); continue;
    }
    const reference = input.reference.observations.find(row => row.checkId === check.id);
    const candidate = input.candidate.observations.find(row => row.checkId === check.id);
    if (reference === undefined || candidate === undefined) {
      if (reference === undefined) add(check.id, 'QA', 'reference:observation-missing');
      if (candidate === undefined) add(check.id, 'QA', 'candidate:observation-missing');
      continue;
    }
    const priorDifferenceCount = differences.length;
    for (const { target, row } of [{ target: 'reference', row: reference }, { target: 'candidate', row: candidate }]) {
      if (row.objectType !== check.objectType || row.stateBranch !== check.stateBranch
        || row.viewport.width !== check.viewport.width || row.viewport.height !== check.viewport.height
        || row.condition !== spec.condition || row.protocol !== spec.protocol || row.metric !== spec.metric || row.unit !== spec.unit) {
        add(check.id, 'QA', `${target}:scenario-mismatch`); continue;
      }
      if (row.samples.length < spec.minimumSamples) { add(check.id, 'QA', `${target}:insufficient-samples`); continue; }
    }
    if (differences.length > priorDifferenceCount) continue;
    const referenceSamples = reference.samples;
    const candidateSamples = candidate.samples;
    if (referenceSamples.some((value) => value < spec.referenceRange.min || value > spec.referenceRange.max)) {
      add(check.id, 'RESEARCH', 'reference-observation-contradicts-contract'); continue;
    }
    const mean = (samples: number[]) => samples.reduce((sum, value) => sum + value, 0) / samples.length;
    if (Math.abs(mean(referenceSamples) - mean(candidateSamples)) > spec.maxDelta
      || candidateSamples.some((value) => value < spec.referenceRange.min - spec.maxDelta || value > spec.referenceRange.max + spec.maxDelta)) {
      add(check.id, 'BUILDER', 'candidate-behavior-diverges');
    }
  }
  return differences;
}
