import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAccountProvider, type CodexExecutor } from '../../src/providers/codex-account.js';
import { ReferenceResearchAgent } from '../../src/agents/index.js';
import type { CodexExecRequest, CodexExecResult } from '../../src/providers/codex-cli.js';
import { normalizeReferenceBehaviorAnalysis } from '../../src/core/reference-evidence.js';
import { deriveReferenceLevelImplementationContract, evaluateReferenceLevelRuntimeTrace } from '../../src/core/reference-level.js';
import { sha256Text } from '../../src/core/files.js';
import { ReferenceBehaviorAnalysisSchema } from '../../src/schemas/index.js';
import { ReferenceLevelRuntimeTraceSchema } from '../../src/schemas/reference-recording.js';
import { measureRuntimeBehaviors } from '../../src/qa/reference-level-qa.js';
import { referenceBehaviorChecks } from '../fixtures/reference-behavior.js';

const hash = (value: string) => sha256Text(value);
const source = { path: 'reference-evidence/incoming/recording.mp4', sha256: hash('recording') };

const pack = {
  schemaVersion: 1 as const, targetRunId: 'run-direction', benchmark: { name: 'synthetic', url: 'https://example.com/reference' },
  sourceFiles: [{ ...source, observations: ['synthetic recording'] }], observations: ['loop'], inferences: [], unknowns: [],
  mechanicMap: { coreLoop: ['ready', 'tap', 'contact', 'settle'], playerActions: ['tap'], progressionSystems: ['none'], unlockRules: ['none'], mustPreserveMechanics: [], feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 2, microGoalMaxSeconds: 5 } },
  behaviorChecks: referenceBehaviorChecks(source), failurePressureContract: null,
  expressionBoundary: { allowed: ['original expression'], forbidden: ['names', 'assets', 'UI', 'audio', 'text', 'raw tuning'] }, similarityRedFlags: [], evidenceQuality: 'supplemented' as const, status: 'READY' as const, claims: [], researchedAt: new Date(0).toISOString(),
};

function makeLevel(direction?: 'approaching') {
  const checkpoint = (id: string, phase: 'ready' | 'input' | 'interaction' | 'aftermath' | 'terminal' | 'replay', index: number, kind: 'none' | 'tap' = 'none') => ({
    id, phase, atMs: index * 600, sourceFrameIds: [`frame-${index}`],
    input: { actionId: kind === 'tap' ? (phase === 'replay' ? 'replay' : 'flip') : null, kind, targetObjectId: kind === 'tap' ? (phase === 'replay' ? 'replay-control' : 'blade') : null, gestureDirection: 'none' as const, sourcePointNormalized: kind === 'tap' ? { x: 0.5, y: 0.5 } : null, confidence: 0.95 },
    camera: { mode: phase === 'replay' ? 'cut' as const : 'follow' as const, focusObjectIds: ['blade'], motion: phase === 'ready' ? 'static' as const : 'forward' as const, confidence: 0.9 },
    objects: [
      { semanticId: 'blade', role: 'player' as const, lifecycle: phase === 'ready' ? 'ready' as const : phase === 'terminal' ? 'settled' as const : 'moving' as const, boundsNormalized: { x: 0.1 + index * 0.04, y: 0.4, width: 0.1, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.95 },
      { semanticId: 'fruit-1', role: 'cuttable' as const, lifecycle: phase === 'interaction' ? 'contact' as const : phase === 'aftermath' ? 'resolved' as const : 'ready' as const, boundsNormalized: { x: 0.5, y: 0.55, width: 0.15, height: 0.15 }, rotationDegrees: 0, visible: phase !== 'replay', confidence: 0.95 },
      { semanticId: 'ground', role: 'support' as const, lifecycle: 'ready' as const, boundsNormalized: { x: 0.05, y: 0.72, width: 0.9, height: 0.18 }, rotationDegrees: 0, visible: phase !== 'replay', confidence: 0.95 },
      { semanticId: 'replay-control', role: 'replay-control' as const, lifecycle: phase === 'terminal' ? 'ready' as const : phase === 'replay' ? 'resolved' as const : 'hidden' as const, boundsNormalized: { x: 0.4, y: 0.75, width: 0.2, height: 0.1 }, rotationDegrees: 0, visible: phase === 'terminal' || phase === 'replay', confidence: 0.95 },
    ], visibleFeedback: [{ id: `feedback-${id}`, anchorObjectId: phase === 'interaction' ? 'fruit-1' : 'blade', order: 1, event: `${phase} feedback` }],
  });
  return {
    schemaVersion: 1, artifactType: 'reference-level-reconstruction', targetRunId: 'run-direction', targetGame: 'direction-game', workspace: '/tmp/run-direction/workspace/game',
    source: { frameManifestPath: 'artifacts/reference-frame-manifest.json', frameManifestSha256: hash('manifest'), recordingSha256: source.sha256, viewport: { width: 1100, height: 720 } },
    checkpoints: [checkpoint('ready', 'ready', 0), checkpoint('tap-1', 'input', 1, 'tap'), checkpoint('cut-1', 'interaction', 2), checkpoint('fall-1', 'aftermath', 3), checkpoint('settled', 'terminal', 4), checkpoint('replayed', 'replay', 5, 'tap')],
    spatialRelations: [{ id: 'fruit-supported', fromObjectId: 'fruit-1', relation: 'supported-by', toObjectId: 'ground', checkpointIds: ['ready', 'tap-1'], observed: true }],
    interactionSequence: [{ order: 1, actionId: 'flip', kind: 'tap', targetObjectId: 'blade', fromCheckpointId: 'ready', toCheckpointId: 'cut-1', responseClass: 'immediate', expectedStateChange: 'blade cuts fruit' }],
    cameraSequence: [{ order: 1, checkpointId: 'ready', mode: 'follow', focusObjectRole: 'player' }, { order: 2, checkpointId: 'settled', mode: 'follow', focusObjectRole: 'player' }],
    terminal: { checkpointId: 'settled', result: 'level-complete', causeVisible: true, settlementVisible: true }, replay: { checkpointId: 'replayed', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
    behaviorMeasurements: [
      { id: 'input-to-contact', kind: 'checkpoint-interval', status: 'OBSERVED', unit: 'ms', fromCheckpointId: 'tap-1', toCheckpointId: 'cut-1', fromEvent: 'tap accepted', toEvent: 'contact feedback', subjectObjectId: null, relatedObjectId: null, sourceCheckpointIds: ['tap-1', 'cut-1'], sourceFrameIds: ['frame-1', 'frame-2'], observedRange: { min: 550, max: 650 }, uncertainty: 300, coordinateSpace: 'screen-normalized', applicability: 'same source viewport', basis: 'adjacent frames bracket response', ...(direction === undefined ? {} : { direction: null }) },
      { id: 'blade-fruit-spacing', kind: 'relative-distance', status: 'OBSERVED', unit: 'normalized-distance', fromCheckpointId: 'ready', toCheckpointId: 'cut-1', fromEvent: 'ready spacing', toEvent: 'contact spacing', subjectObjectId: 'blade', relatedObjectId: 'fruit-1', sourceCheckpointIds: ['ready', 'cut-1'], sourceFrameIds: ['frame-0', 'frame-2'], observedRange: { min: 0.05, max: 0.15 }, uncertainty: 0.05, coordinateSpace: 'screen-normalized', ...(direction === undefined ? {} : { direction }), applicability: 'same follow camera', basis: 'center distance changes across checkpoints' },
    ], observations: ['source loop'], inferences: [], unknowns: [], status: 'READY', blockers: [], analyzedAt: new Date(0).toISOString(),
  };
}

function analysis(level: unknown) {
  return { schemaVersion: 1, targetRunId: 'run-direction', behaviorChecks: referenceBehaviorChecks(source), observations: ['loop'], inferences: [], unknowns: [], failurePressureContract: null, levelReconstruction: level, status: 'READY' as const };
}

class FakeExecutor implements CodexExecutor {
  readonly requests: CodexExecRequest[] = [];
  constructor(private readonly outputs: unknown[]) {}
  async assertChatGptLogin() { return { method: 'chatgpt' as const, message: 'Logged in using ChatGPT' }; }
  async execute(request: CodexExecRequest): Promise<CodexExecResult> { this.requests.push(request); return { events: [], threadId: `thread-${request.label}`, completed: true, failed: false, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, errors: [], output: this.outputs.shift(), attempts: 1, stdout: '', stderr: '' }; }
}

const context = (root: string) => ({ runRoot: root, outputPath: path.join(root, 'analysis.json'), logDir: path.join(root, 'logs'), inputPaths: ['artifacts/reference-evidence-pack.json', 'artifacts/reference-frame-manifest.json'], stage: 'REFERENCE_DEEP_RESEARCH' as const, sandbox: 'read-only' as const, contextPacket: { schemaVersion: 1, stage: 'REFERENCE_DEEP_RESEARCH', summary: 'synthetic', inputs: [], omitted: [], totalChars: 0 } });

function runtimeTrace(raw: any, contract: any, observedMeasurements: any[]) {
  const placement = new Map((contract.placementRules ?? []).map((rule: any) => [`${rule.checkpointId}:${rule.semanticId}`, rule]));
  return {
    schemaVersion: 1, artifactType: 'reference-level-runtime-trace', targetRunId: contract.targetRunId, targetGame: contract.targetGame, workspace: contract.workspace,
    contractHash: hash(JSON.stringify(contract)), buildHash: hash('build'), viewport: { width: 390, height: 844, label: 'test' }, startedFromReset: true, naturalInputOnly: true,
    actions: contract.interactionSequence.map((action: any) => ({ order: action.order, actionId: action.actionId, kind: action.kind, targetObjectId: action.targetObjectId, naturalInput: true, stateChanged: true, observedCheckpointId: action.toCheckpointId })),
    checkpoints: raw.checkpoints.map((checkpoint: any) => ({
      sourceCheckpointId: checkpoint.id, phase: checkpoint.phase, cameraMode: checkpoint.camera.mode,
      objectStates: checkpoint.objects.map((object: any) => ({ semanticId: object.semanticId, role: object.role, lifecycle: object.lifecycle, visible: object.visible, ...(object.visible && placement.has(`${checkpoint.id}:${object.semanticId}`) ? { placement: Object.fromEntries(Object.entries(placement.get(`${checkpoint.id}:${object.semanticId}`) as any).filter(([key]) => key !== 'checkpointId' && key !== 'semanticId')) } : {}) })),
      observedRelationIds: raw.spatialRelations.filter((relation: any) => relation.checkpointIds.includes(checkpoint.id)).map((relation: any) => relation.id), visibleFeedbackIds: checkpoint.visibleFeedback.map((feedback: any) => feedback.id),
    })),
    observedMeasurements, terminal: { reached: true, result: contract.terminal.result, causeVisible: true, settlementVisible: true }, replay: { actionId: contract.replay.actionId, returnedToCheckpointId: contract.replay.returnsToCheckpointId, naturalInput: true },
    screenshots: [{ path: 'evidence/screenshot.png', sha256: hash('screenshot') }], trace: { path: 'evidence/trace.json', sha256: hash('trace') }, reviewer: 'QAAgent', authorIndependent: true, observedAt: new Date(0).toISOString(),
  };
}

function assertStrictSchemaTree(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertStrictSchemaTree);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    const properties = node.properties as Record<string, unknown>;
    expect(node.additionalProperties).toBe(false);
    expect(new Set(node.required as string[])).toEqual(new Set(Object.keys(properties)));
    Object.values(properties).forEach(assertStrictSchemaTree);
  }
  Object.entries(node).forEach(([key, child]) => {
    if (key !== 'properties' && key !== 'required') assertStrictSchemaTree(child);
  });
}

function extractBuilderBehaviorTargets(prompt: string): unknown[] {
  const marker = 'R1 behavior targets:\n';
  const start = prompt.indexOf(marker);
  if (start < 0) throw new Error('Builder prompt is missing the R1 behavior target array');
  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonEnd = -1;
  for (let index = jsonStart; index < prompt.length; index += 1) {
    const character = prompt[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === '[') depth += 1;
    if (character === ']') {
      depth -= 1;
      if (depth === 0) { jsonEnd = index + 1; break; }
    }
  }
  if (jsonEnd < 0) throw new Error('Builder prompt has an unterminated R1 behavior target array');
  const parsed: unknown = JSON.parse(prompt.slice(jsonStart, jsonEnd));
  if (!Array.isArray(parsed)) throw new Error('Builder R1 behavior targets are not an array');
  return parsed;
}

function assertBuilderBehaviorTargets(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('Builder R1 behavior targets are not an array');
  const timeTargets = value.filter((target) => target && typeof target === 'object' && (target as Record<string, unknown>).id === 'input-to-contact');
  const distanceTargets = value.filter((target) => target && typeof target === 'object' && (target as Record<string, unknown>).id === 'blade-fruit-spacing');
  if (timeTargets.length !== 1) throw new Error(`expected one input-to-contact target, got ${timeTargets.length}`);
  if (distanceTargets.length !== 1) throw new Error(`expected one blade-fruit-spacing target, got ${distanceTargets.length}`);
  const time = timeTargets[0] as Record<string, unknown>;
  const distance = distanceTargets[0] as Record<string, unknown>;
  if (time.kind !== 'checkpoint-interval' || Object.hasOwn(time, 'direction')) throw new Error('input-to-contact must be directionless checkpoint interval');
  if (distance.kind !== 'relative-distance' || distance.direction !== 'approaching') throw new Error('blade-fruit-spacing must preserve approaching direction');
}

describe('R1 time measurement direction pipeline', () => {
  it('allows null only for behavior measurement direction in the structured output schema', () => {
    const root = '/tmp/r1-direction-schema-test';
    const raw = analysis(makeLevel('approaching'));
    const client = new FakeExecutor([raw]);
    const provider = new CodexAccountProvider(client);
    return provider.analyzeReferenceEvidence(pack as any, context(root)).then(() => {
      const schema = client.requests[0]?.outputSchema as any;
      const find = (value: any): any => value?.properties?.behaviorMeasurements ? value.properties.behaviorMeasurements.items : Array.isArray(value) ? value.map(find).find(Boolean) : value && typeof value === 'object' ? Object.values(value).map(find).find(Boolean) : undefined;
      const measurement = find(schema);
      expect(measurement.required).toContain('direction');
      expect(new Set(measurement.required)).toEqual(new Set(Object.keys(measurement.properties)));
      expect(measurement.additionalProperties).toBe(false);
      expect(measurement.properties.direction.anyOf).toEqual([
        { type: 'string', enum: ['approaching', 'separating', 'stable'] },
        { type: 'null' },
      ]);
      assertStrictSchemaTree(schema);

      const findGestureDirection = (value: any): any => {
        if (Array.isArray(value)) return value.map(findGestureDirection).find(Boolean);
        if (!value || typeof value !== 'object') return undefined;
        if (value.properties?.gestureDirection !== undefined) return value.properties.gestureDirection;
        const propertyMatch = value.properties && typeof value.properties === 'object' ? Object.values(value.properties).map(findGestureDirection).find(Boolean) : undefined;
        return propertyMatch ?? Object.entries(value).filter(([key]) => key !== 'properties' && key !== 'required').map(([, child]) => findGestureDirection(child)).find(Boolean);
      };
      expect(findGestureDirection(schema)).toEqual({ type: 'string', enum: ['none', 'up', 'down', 'left', 'right'] });
    });
  });

  it('runs the formal Research Agent, normalizes transport null before canonical parse, and keeps the Builder target directionless for time', async () => {
    const raw = analysis(makeLevel('approaching'));
    const research = await new ReferenceResearchAgent(new CodexAccountProvider(new FakeExecutor([raw]))).run(pack as any, context('/tmp/r1-direction-agent-test'));
    const parsed = ReferenceBehaviorAnalysisSchema.parse(research.value);
    const contract = deriveReferenceLevelImplementationContract(parsed.levelReconstruction, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') });
    expect((parsed.levelReconstruction?.behaviorMeasurements ?? [])[0]).not.toHaveProperty('direction');
    expect((parsed.levelReconstruction?.behaviorMeasurements ?? [])[1]).toMatchObject({ direction: 'approaching' });
    expect(contract.behaviorMeasurements?.[0]).not.toHaveProperty('direction');
    expect(contract.behaviorMeasurements?.[1]).toMatchObject({ direction: 'approaching' });
  });

  it('projects the same canonical measurements into the Builder-visible targets', async () => {
    const raw = analysis(makeLevel('approaching'));
    const client = new FakeExecutor([raw, 'implemented']);
    const provider = new CodexAccountProvider(client);
    const research = await new ReferenceResearchAgent(provider).run(pack as any, context('/tmp/r1-direction-builder-test'));
    const parsed = ReferenceBehaviorAnalysisSchema.parse(research.value);
    const contract = deriveReferenceLevelImplementationContract(parsed.levelReconstruction, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('builder-reconstruction') });

    await provider.build({
      workspace: '/tmp/r1-direction-builder-test/workspace/game',
      blueprint: { designMode: 'reference_reskin', runtime: 'web-lite', preferences: {} } as any,
      styleLock: {} as any,
      assets: {} as any,
      template: 'cut-stack-dodge-v1',
      referenceLevelBehaviorTargets: contract.behaviorMeasurements,
    });

    const prompt = client.requests.find((request) => request.label === 'BUILD')?.prompt ?? '';
    const capturedTargets = extractBuilderBehaviorTargets(prompt);
    assertBuilderBehaviorTargets(capturedTargets);
    expect(() => assertBuilderBehaviorTargets(capturedTargets.map((target) => target && typeof target === 'object' && (target as Record<string, unknown>).id === 'input-to-contact' ? { ...(target as Record<string, unknown>), direction: 'approaching' } : target))).toThrow(/directionless/);
    expect(() => assertBuilderBehaviorTargets(capturedTargets.filter((target) => target && typeof target === 'object' && (target as Record<string, unknown>).id !== 'input-to-contact'))).toThrow(/input-to-contact/);
    expect(prompt).not.toContain('sourceFrameIds');
    expect(prompt).not.toContain('frame-a');
  });

  it('does not require a candidate direction for the derived time target', () => {
    const raw = analysis(makeLevel('approaching'));
    const parsed = ReferenceBehaviorAnalysisSchema.parse(normalizeReferenceBehaviorAnalysis(raw, pack));
    const contract = deriveReferenceLevelImplementationContract(parsed.levelReconstruction, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') });
    const target = (contract.behaviorMeasurements ?? []).find((item) => item.kind === 'checkpoint-interval');
    expect(target).toBeDefined();
    if (!target) return;
    expect(target).not.toHaveProperty('direction');
    const candidateMeasurements = measureRuntimeBehaviors(contract, [
      { sourceCheckpointId: 'tap-1', capturedAtMs: 100, sampleGapMs: 20, phase: 'input', objectStates: [], observedRelationIds: [], cameraMode: 'follow', visibleFeedbackIds: [] },
      { sourceCheckpointId: 'cut-1', capturedAtMs: 700, sampleGapMs: 20, phase: 'interaction', objectStates: [], observedRelationIds: [], cameraMode: 'follow', visibleFeedbackIds: [] },
    ] as any, [{ path: 'evidence/trace.json', sha256: hash('trace') }], { width: 390, height: 844 });
    expect(candidateMeasurements?.[0]).toMatchObject({ measurementId: target.measurementId, status: 'MEASURED', actualRange: { min: 580, max: 620 } });
    expect(candidateMeasurements?.[0]).not.toHaveProperty('direction');
    const trace = ReferenceLevelRuntimeTraceSchema.parse(runtimeTrace(parsed.levelReconstruction, contract, candidateMeasurements ?? []));
    const gate = evaluateReferenceLevelRuntimeTrace(contract, trace);
    expect(gate.measurementResults?.find((item) => item.measurementId === target.measurementId)?.result).toBe('CONFORMING');
    expect(gate.blockers).not.toContain(`reference-level:measurement-insufficient:${target.measurementId}`);
  });

  it('preserves legacy distance comparison semantics when direction is absent', () => {
    const raw = analysis(makeLevel(undefined));
    const parsed = ReferenceBehaviorAnalysisSchema.parse(normalizeReferenceBehaviorAnalysis(raw, pack));
    const contract = deriveReferenceLevelImplementationContract(parsed.levelReconstruction, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('legacy-reconstruction') });
    const distance = (contract.behaviorMeasurements ?? []).find((item) => item.kind === 'relative-distance');
    expect(distance).toBeDefined();
    if (!distance) return;
    expect(distance).not.toHaveProperty('direction');
    expect(hash(JSON.stringify((parsed.levelReconstruction?.behaviorMeasurements ?? [])[1]))).toBe(hash(JSON.stringify((((raw as any).levelReconstruction?.behaviorMeasurements ?? [])[1]))));
    const time = (contract.behaviorMeasurements ?? []).find((item) => item.kind === 'checkpoint-interval');
    expect(time).toBeDefined();
    if (!time) return;
    const trace = ReferenceLevelRuntimeTraceSchema.parse(runtimeTrace(parsed.levelReconstruction, contract, [
      { measurementId: time!.measurementId, status: 'MEASURED', unit: 'ms', actualRange: { min: 600, max: 600 }, coordinateSpace: 'screen-normalized', sourceCheckpointIds: ['tap-1', 'cut-1'], subjectObjectId: null, relatedObjectId: null, basis: 'legacy time', evidence: [{ path: 'evidence/trace.json', sha256: hash('trace') }] },
      { measurementId: distance.measurementId, status: 'MEASURED', unit: 'normalized-distance', actualRange: { min: 0.08, max: 0.12 }, coordinateSpace: 'screen-normalized', sourceCheckpointIds: ['ready', 'cut-1'], subjectObjectId: 'blade', relatedObjectId: 'fruit-1', basis: 'legacy absolute distance', evidence: [{ path: 'evidence/trace.json', sha256: hash('trace') }] },
    ]));
    const gate = evaluateReferenceLevelRuntimeTrace(contract, trace);
    expect(gate.measurementResults?.find((item) => item.measurementId === distance.measurementId)?.result).toBe('CONFORMING');
  });
});
