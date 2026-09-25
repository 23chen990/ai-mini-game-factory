import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { sha256Text } from '../../src/core/files.js';
import { compileReferenceLevelRuntimeData } from '../../src/core/reference-level-runtime.js';
import { runReferenceLevelQa } from '../../src/qa/reference-level-qa.js';
import { ReferenceLevelImplementationContractSchema } from '../../src/schemas/reference-recording.js';
import type { ReferenceLevelImplementationContract } from '../../src/schemas/reference-recording.js';
import { resolveProductionLine } from '../../src/core/production-line-resolution.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const hash = (value: string) => sha256Text(value);
const identityFor = (runRoot: string) => ({ targetRunId: path.basename(runRoot), targetGame: 'R1 browser behavior fixture', workspace: path.join(runRoot, 'workspace/game') });

function contractFor(runRoot: string): ReferenceLevelImplementationContract {
  const identity = identityFor(runRoot);
  const placement = { horizontalBand: 'center' as const, verticalBand: 'middle' as const, widthBand: 'small' as const, heightBand: 'small' as const, orientationBand: 'horizontal' as const };
  return ReferenceLevelImplementationContractSchema.parse({
    schemaVersion: 1, artifactType: 'reference-level-implementation-contract', ...identity,
    sourceReconstruction: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('r1-source') },
    requiredObjects: [
      { semanticId: 'hero', role: 'player', spawnOrder: 0, lifecycleOrder: ['ready', 'moving', 'terminal'] },
      { semanticId: 'target', role: 'cuttable', spawnOrder: 1, lifecycleOrder: ['ready', 'contact', 'resolved'] },
      { semanticId: 'platform', role: 'support', spawnOrder: 2, lifecycleOrder: ['ready', 'settled'] },
      { semanticId: 'replay-control', role: 'replay-control', spawnOrder: 3, lifecycleOrder: ['hidden', 'ready', 'resolved'] },
    ],
    checkpointSequence: [
      { order: 1, id: 'ready', phase: 'ready', requiredVisibleObjectIds: ['hero', 'target', 'platform'], visibleFeedbackIds: ['feedback-ready'] },
      { order: 2, id: 'interaction', phase: 'interaction', requiredVisibleObjectIds: ['hero', 'target', 'platform'], visibleFeedbackIds: ['feedback-interaction'] },
      { order: 3, id: 'terminal', phase: 'terminal', requiredVisibleObjectIds: ['hero', 'platform', 'replay-control'], visibleFeedbackIds: ['feedback-terminal'] },
      { order: 4, id: 'replay', phase: 'replay', requiredVisibleObjectIds: ['hero', 'platform', 'replay-control'], visibleFeedbackIds: ['feedback-replay'] },
    ],
    placementRules: [
      { checkpointId: 'ready', semanticId: 'hero', ...placement }, { checkpointId: 'ready', semanticId: 'target', ...placement }, { checkpointId: 'ready', semanticId: 'platform', ...placement },
      { checkpointId: 'interaction', semanticId: 'hero', ...placement }, { checkpointId: 'interaction', semanticId: 'target', ...placement }, { checkpointId: 'interaction', semanticId: 'platform', ...placement },
      { checkpointId: 'terminal', semanticId: 'hero', ...placement }, { checkpointId: 'terminal', semanticId: 'platform', ...placement },
      { checkpointId: 'replay', semanticId: 'hero', ...placement }, { checkpointId: 'replay', semanticId: 'platform', ...placement }, { checkpointId: 'replay', semanticId: 'replay-control', ...placement },
    ],
    spatialRelations: [{ id: 'standing', fromObjectId: 'hero', relation: 'supported-by', toObjectId: 'platform', checkpointIds: ['ready', 'interaction'] }],
    interactionSequence: [{ order: 1, actionId: 'advance', kind: 'tap', targetObjectId: 'hero', fromCheckpointId: 'ready', toCheckpointId: 'interaction', responseClass: 'immediate', expectedStateChange: 'hero reaches interaction target' }],
    cameraSequence: [{ order: 1, checkpointId: 'ready', mode: 'static', focusObjectRole: 'player' }, { order: 2, checkpointId: 'terminal', mode: 'static', focusObjectRole: 'player' }],
    terminal: { checkpointId: 'terminal', result: 'completed', causeVisible: true, settlementVisible: true },
    replay: { checkpointId: 'replay', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
    behaviorMeasurements: [
      {
        id: 'response-interval', measurementId: 'response-interval', kind: 'checkpoint-interval', unit: 'ms', fromCheckpointId: 'ready', toCheckpointId: 'interaction', subjectObjectId: null, relatedObjectId: null,
        expectedRange: { min: 100, max: 100 }, acceptanceRange: { min: 0, max: 260 }, uncertainty: 100, coordinateSpace: 'screen-normalized', applicability: 'normal tap, same semantic transition', sourceFrameIds: ['source-ready', 'source-interaction'], source: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('r1-source') },
      },
      {
        id: 'hero-target-spacing-change', measurementId: 'hero-target-spacing-change', kind: 'relative-distance', unit: 'normalized-distance', fromCheckpointId: 'ready', toCheckpointId: 'interaction', subjectObjectId: 'hero', relatedObjectId: 'target',
        expectedRange: { min: 0.35, max: 0.35 }, acceptanceRange: { min: 0.30, max: 0.40 }, uncertainty: 0.05, coordinateSpace: 'screen-normalized', direction: 'approaching', applicability: 'same semantic objects; aspect-corrected screen space', sourceFrameIds: ['source-ready', 'source-interaction'], source: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('r1-source') },
      },
    ],
    runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true, methods: ['getSnapshot', 'getNaturalInputTarget'] },
    originalityBoundary: { sourceCoordinatesExposedToBuilder: false, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] },
    status: 'READY', blockers: [], createdAt: new Date(0).toISOString(),
  });
}

async function fixture(variant: 'baseline' | 'slow' | 'probe-delay' | 'far' | 'reverse' | 'unchanged' | 'missing-bounds') {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-r1-browser-'));
  roots.push(runRoot);
  const identity = identityFor(runRoot);
  const contract = contractFor(runRoot);
  const resolution = resolveProductionLine({ title: 'R1 browser fixture', theme: 'timing and spacing', template: 'idle-shop-v1', runtime: 'web-lite' });
  const runtimeData = compileReferenceLevelRuntimeData(contract, resolution, identity);
  const dataFile = path.join(identity.workspace, 'src/generated/reference-level.json');
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(runtimeData)}\n`);
  const delay = variant === 'slow' ? 700 : 0;
  const probeDelay = variant === 'probe-delay' ? 180 : 0;
  const reverse = variant === 'reverse';
  const unchanged = variant === 'unchanged';
  const interactionX = reverse ? 0.9 : variant === 'far' ? 0.85 : 0.45;
  const targetX = reverse ? 0.15 : 0.6;
  const includeBounds = variant !== 'missing-bounds';
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:20px sans-serif;margin:0;padding:24px}button{font:inherit;padding:16px;margin:12px}</style><button id="advance">Advance</button><button id="replay" hidden>Replay</button><p id="state">ready</p><script>
    const data=${JSON.stringify(runtimeData)}; const delay=${delay}; const probeDelay=${probeDelay}; const interactionX=${interactionX}; const targetX=${targetX}; const reverse=${reverse}; const includeBounds=${includeBounds}; const unchanged=${unchanged}; let phase='ready'; let clicks=0;
    const advance=document.querySelector('#advance'), replay=document.querySelector('#replay'), label=document.querySelector('#state');
    function render(){ advance.hidden=phase==='terminal'||phase==='replay'; replay.hidden=phase!=='terminal'; label.textContent=phase; }
    advance.onclick=()=>{ if(unchanged) return; clicks++; if(clicks===1){ setTimeout(()=>{phase='interaction';render()},delay); } else { phase='terminal';render(); } };
    replay.onclick=()=>{ clicks=0; phase='replay'; render(); setTimeout(()=>{phase='ready';render()},20); };
    function stateObject(id,role,lifecycle,visible,bounds){ return {semanticId:id,role,lifecycle,visible,placement:{horizontalBand:'center',verticalBand:'middle',widthBand:'small',heightBand:'small',orientationBand:'horizontal'},...(includeBounds&&bounds?{boundsNormalized:bounds,coordinateSpace:'screen-normalized'}:{})}; }
    function getSnapshot(){ if(phase==='interaction'&&probeDelay){ const until=performance.now()+probeDelay; while(performance.now()<until){} } const terminal=phase==='terminal'; const replayPhase=phase==='replay'; const heroX=phase==='interaction'?interactionX:reverse?0.55:0.1; return {checkpointId:phase,phase, runtimeBinding:{runtimeDataHash:data.runtimeDataHash,contractHash:data.sourceContract.sha256,resolutionHash:data.production.resolutionHash,dataPath:'src/generated/reference-level.json'},objectStates:[stateObject('hero','player',terminal?'terminal':phase==='ready'||replayPhase?'ready':'moving',true,{x:heroX,y:0.4,width:0.1,height:0.1}),stateObject('target','cuttable',phase==='interaction'?'contact':terminal||replayPhase?'resolved':'ready',!terminal&&!replayPhase,{x:targetX,y:0.4,width:0.1,height:0.1}),stateObject('platform','support',terminal||replayPhase?'settled':'ready',true,{x:0.35,y:0.7,width:0.3,height:0.1}),stateObject('replay-control','replay-control',replayPhase?'resolved':terminal?'ready':'hidden',terminal||replayPhase,{x:0.4,y:0.8,width:0.2,height:0.1})],observedRelationIds:terminal||replayPhase?[]:['standing'],cameraMode:'static',visibleFeedbackIds:['feedback-'+phase],terminal:{reached:terminal,result:terminal?'completed':'not-observed',causeVisible:terminal,settlementVisible:terminal}} }
    function getNaturalInputTarget(id){ const node=/replay/iu.test(id)?replay:advance; const r=node.getBoundingClientRect(); return {x:(r.left+r.width/2)/innerWidth,y:(r.top+r.height/2)/innerHeight}; }
    window.__REFERENCE_LEVEL_TEST__={getSnapshot,getNaturalInputTarget}; render();
  </script>`;
  let server: Server | undefined;
  const runtime: RuntimeAdapter = {
    createProject: async () => { throw new Error('fixture preview only'); }, applyBlueprint: async () => { throw new Error('fixture preview only'); }, importAssets: async () => { throw new Error('fixture preview only'); },
    verifyProject: async () => { throw new Error('fixture preview only'); }, buildWeb: async () => { throw new Error('fixture preview only'); }, buildTarget: async () => { throw new Error('fixture preview only'); }, stopPreview: async () => undefined,
    async startPreview() {
      server = createServer((request, response) => { response.setHeader('Content-Type', request.url === '/level.json' ? 'application/json' : 'text/html'); if (request.url === '/level.json') response.end(JSON.stringify(runtimeData)); else response.end(html); });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture server has no port');
      return { url: `http://127.0.0.1:${address.port}/`, stop: () => new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve())) };
    },
  };
  return { runtime, runRoot, workspace: identity.workspace, contract, runtimeData, buildHash: hash(`${variant}-candidate`), viewport: { width: 390, height: 844, label: 'phone' } };
}

describe('R1 natural browser behavior comparison', () => {
  it('accepts a baseline and detects timing and spacing differences from real pointer input', async () => {
    const baseline = await runReferenceLevelQa(await fixture('baseline'));
    expect(baseline.gate.comparisonStatus, JSON.stringify(baseline.gate)).toBe('CONFORMING');
    expect(baseline.gate.passed).toBe(true);
    expect(baseline.trace.actions.some((action) => action.naturalInput && action.stateChanged)).toBe(true);
    expect(new Set(baseline.trace.screenshots.map((item) => item.path)).size).toBe(baseline.trace.screenshots.length);

    const slow = await runReferenceLevelQa(await fixture('slow'));
    expect(slow.gate.comparisonStatus).toBe('DIFFERENT');
    expect(slow.gate.measurementResults).toEqual(expect.arrayContaining([expect.objectContaining({ measurementId: 'response-interval', result: 'DIFFERENT' })]));

    const delayedObservation = await runReferenceLevelQa(await fixture('probe-delay'));
    expect(delayedObservation.gate.comparisonStatus).not.toBe('DIFFERENT');

    const far = await runReferenceLevelQa(await fixture('far'));
    expect(far.gate.comparisonStatus).toBe('DIFFERENT');
    expect(far.gate.measurementResults).toEqual(expect.arrayContaining([expect.objectContaining({ measurementId: 'hero-target-spacing-change', result: 'DIFFERENT' })]));
  }, 30_000);

  it('reports insufficient evidence when the live probe cannot expose the measured bounds', async () => {
    const result = await runReferenceLevelQa(await fixture('missing-bounds'));
    expect(result.gate.comparisonStatus).toBe('INSUFFICIENT');
    expect(result.gate.measurementResults).toEqual(expect.arrayContaining([expect.objectContaining({ measurementId: 'hero-target-spacing-change', result: 'INSUFFICIENT' })]));
    expect(result.trace.actions.some((action) => action.naturalInput)).toBe(true);
  }, 30_000);

  it('marks a natural click that leaves the game state unchanged as stateChanged=false', async () => {
    const result = await runReferenceLevelQa(await fixture('unchanged'));
    expect(result.trace.actions[0]?.stateChanged).toBe(false);
  }, 30_000);

  it('keeps the sign of relative-distance change and rejects the opposite direction', async () => {
    const candidate = await fixture('reverse');
    const result = await runReferenceLevelQa(candidate);
    const expectedDistance = candidate.contract.behaviorMeasurements?.find((measurement) => measurement.measurementId === 'hero-target-spacing-change');
    const observedDistance = result.trace.observedMeasurements?.find((measurement) => measurement.measurementId === 'hero-target-spacing-change');
    const distanceResult = result.gate.measurementResults?.find((measurement) => measurement.measurementId === 'hero-target-spacing-change');
    expect(result.trace.actions.some((action) => action.naturalInput && action.stateChanged)).toBe(true);
    expect(expectedDistance?.direction).toBe('approaching');
    expect(observedDistance?.direction).toBe('separating');
    expect(distanceResult).toMatchObject({ measurementId: 'hero-target-spacing-change', result: 'DIFFERENT' });
    expect(result.gate.passed).toBe(false);
  }, 30_000);
});
