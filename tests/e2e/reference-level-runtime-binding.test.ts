import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { sha256Text } from '../../src/core/files.js';
import { resolveProductionLine } from '../../src/core/production-line-resolution.js';
import { compileReferenceLevelRuntimeData } from '../../src/core/reference-level-runtime.js';
import { verifyReferenceLevelRuntimeTrace } from '../../src/core/reference-level.js';
import { ReferenceLevelImplementationContractSchema } from '../../src/schemas/reference-recording.js';
import { runReferenceLevelQa } from '../../src/qa/reference-level-qa.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

// A synthetic control-plane fixture: this verifies browser input and binding
// collection, and makes no claim about any generated game's visual fidelity.
async function fixture(mode: 'current' | 'missing' | 'stale-after-action' | 'missing-layout') {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-runtime-browser-'));
  roots.push(runRoot);
  const workspace = path.join(runRoot, 'workspace/game');
  const identity = { targetRunId: path.basename(runRoot), targetGame: 'Synthetic runtime binding fixture', workspace };
  const contract = ReferenceLevelImplementationContractSchema.parse({
    schemaVersion: 1, artifactType: 'reference-level-implementation-contract', ...identity,
    sourceReconstruction: { path: 'artifacts/reference-level-reconstruction.json', sha256: sha256Text('synthetic') },
    requiredObjects: [
      { semanticId: 'player', role: 'player', spawnOrder: 0, lifecycleOrder: ['ready', 'terminal'] },
      { semanticId: 'platform', role: 'support', spawnOrder: 1, lifecycleOrder: ['ready'] },
      { semanticId: 'replay', role: 'replay-control', spawnOrder: 2, lifecycleOrder: ['hidden', 'ready'] },
    ],
    checkpointSequence: [
      { order: 1, id: 'ready', phase: 'ready', requiredVisibleObjectIds: ['player', 'platform'], visibleFeedbackIds: ['ready'] },
      { order: 2, id: 'settlement', phase: 'terminal', requiredVisibleObjectIds: ['player', 'platform', 'replay'], visibleFeedbackIds: ['finished'] },
    ],
    placementRules: [{ checkpointId: 'ready', semanticId: 'player', horizontalBand: 'far-left', verticalBand: 'upper', widthBand: 'small', heightBand: 'tiny', orientationBand: 'horizontal' }],
    spatialRelations: [{ id: 'standing', fromObjectId: 'player', relation: 'supported-by', toObjectId: 'platform', checkpointIds: ['ready', 'settlement'] }],
    interactionSequence: [{ order: 1, actionId: 'finish', kind: 'tap', targetObjectId: 'player', fromCheckpointId: 'ready', toCheckpointId: 'settlement', responseClass: 'immediate', expectedStateChange: 'visible settlement opens' }],
    cameraSequence: [{ order: 1, checkpointId: 'ready', mode: 'static', focusObjectRole: 'player' }],
    terminal: { checkpointId: 'settlement', result: 'completed', causeVisible: true, settlementVisible: true },
    replay: { checkpointId: 'settlement', actionId: 'replay', targetObjectId: 'replay', returnsToCheckpointId: 'ready' },
    runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true, methods: ['getSnapshot', 'getNaturalInputTarget'] },
    originalityBoundary: { sourceCoordinatesExposedToBuilder: false, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] },
    status: 'READY', blockers: [], createdAt: new Date(0).toISOString(),
  });
  const resolution = resolveProductionLine({ title: 'Synthetic binding fixture', theme: 'synthetic input', template: mode === 'missing-layout' ? 'cut-stack-dodge-v1' : 'idle-shop-v1', runtime: 'web-lite' });
  const runtimeData = compileReferenceLevelRuntimeData(contract, resolution, identity);
  const dataFile = path.join(workspace, 'src/generated/reference-level.json');
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(runtimeData));
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{margin:0;font:20px sans-serif}#player{position:absolute;left:40px;top:200px;width:40px;height:40px;background:blue}
    #platform{position:absolute;left:20px;top:240px;width:180px;height:30px;background:gray}button{font:inherit;padding:24px;margin:20px}
    </style><div id="player"></div><div id="platform"></div><button id="finish">Finish</button><button id="replay" hidden>Replay</button><p id="status">Ready</p>
    <script type="module">
    const data=await fetch('/level.json').then(r=>r.json());
    const mode=${JSON.stringify(mode)};let terminal=false;
    const finish=document.querySelector('#finish'), replay=document.querySelector('#replay'), status=document.querySelector('#status');
    function render(){finish.hidden=terminal;replay.hidden=!terminal;status.textContent=terminal?'Completed — replay available':'Ready'}
    finish.onclick=()=>{terminal=true;render()};replay.onclick=()=>{terminal=false;render()};
    function getSnapshot(){return {
      checkpointId:terminal?'settlement':'ready',phase:terminal?'terminal':'ready',
      ...(mode==='missing'?{}:{runtimeBinding:{runtimeDataHash:mode==='stale-after-action'&&terminal?'0'.repeat(64):data.runtimeDataHash,contractHash:data.sourceContract.sha256,resolutionHash:data.production.resolutionHash,dataPath:'src/generated/reference-level.json'}}),
      objectStates:[{semanticId:'player',role:'player',lifecycle:terminal?'terminal':'ready',visible:true,placement:{horizontalBand:'far-left',verticalBand:'upper',widthBand:'small',heightBand:'tiny',orientationBand:'horizontal'}},{semanticId:'platform',role:'support',lifecycle:'ready',visible:true},{semanticId:'replay',role:'replay-control',lifecycle:terminal?'ready':'hidden',visible:!replay.hidden}],
      observedRelationIds:['standing'],cameraMode:'static',visibleFeedbackIds:[terminal?'finished':'ready'],
      terminal:{reached:terminal,result:terminal?'completed':'not-observed',causeVisible:terminal,settlementVisible:terminal}
    }}
    function getNaturalInputTarget(id){const r=document.getElementById(id).getBoundingClientRect();return {x:(r.left+r.width/2)/innerWidth,y:(r.top+r.height/2)/innerHeight}}
    window.__REFERENCE_LEVEL_TEST__={getSnapshot,getNaturalInputTarget};
    </script>`;
  const unavailable = async (): Promise<never> => { throw new Error('synthetic QA fixture supports preview only'); };
  const runtime: RuntimeAdapter = {
    createProject: unavailable, applyBlueprint: unavailable, importAssets: unavailable,
    verifyProject: unavailable, buildWeb: unavailable, buildTarget: unavailable, stopPreview: unavailable,
    async startPreview() {
      const server = createServer((request, response) => {
        response.setHeader('Content-Type', request.url === '/level.json' ? 'application/json' : 'text/html');
        if (request.url === '/level.json') void readFile(dataFile).then((body) => response.end(body));
        else response.end(html);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture server has no port');
      return { url: `http://127.0.0.1:${address.port}/`, stop: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
    },
  };
  return { runtime, runRoot, workspace, contract, runtimeData, buildHash: sha256Text(html), viewport: { width: 390, height: 844, label: 'phone' } };
}

describe('recording runtime binding in a fresh browser', () => {
  it('blocks cut production QA when authored layout is missing even if the browser probe claims matching data', async () => {
    const result = await runReferenceLevelQa(await fixture('missing-layout'));
    expect(result.gate.passed).toBe(false);
    expect(result.gate.blockers.join('\n')).toMatch(/reference-level-layout/);
    expect(result.trace.actions).toEqual([]);
  });

  it.each(['current', 'missing', 'stale-after-action'] as const)('checks %s data throughout natural settlement and replay', async (mode) => {
    const input = await fixture(mode);
    const result = await runReferenceLevelQa(input);
    expect(result.gate.passed, JSON.stringify(result.gate.blockers)).toBe(mode === 'current');
    expect(result.trace.actions).toMatchObject([{ actionId: 'finish', naturalInput: true, stateChanged: true }]);
    expect(result.trace.replay).toMatchObject({ returnedToCheckpointId: 'ready', naturalInput: true });
    if (mode === 'missing') expect(result.gate.blockers).toContain('reference-level:runtime-binding-missing:ready');
    if (mode === 'stale-after-action') expect(result.gate.blockers).toContain('reference-level:runtime-binding-mismatch:settlement');
    const replayedGate = await verifyReferenceLevelRuntimeTrace(input.contract, result.trace, { runtimeData: input.runtimeData });
    expect(replayedGate.passed).toBe(mode === 'current');
  });
});
