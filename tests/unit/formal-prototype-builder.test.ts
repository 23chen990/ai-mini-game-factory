import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { BuilderAgent, FixerAgent } from '../../src/agents/index.js';
import { CodexAccountProvider, type CodexExecutor } from '../../src/providers/codex-account.js';
import type { CodexExecRequest, CodexExecResult } from '../../src/providers/codex-cli.js';
import type { CodexProvider, FormalPrototypeBuildInput } from '../../src/providers/interfaces.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const input: FormalPrototypeBuildInput = {
  constraints: {
    schemaVersion: 1,
    game: { title: '夜市飞侠：护印突围', shortTitle: '夜市飞侠', subtitle: '护印突围' },
    targetWorkspace: 'runs/mobile-chart-adaptation-20260830/workspace/prototype-a',
    openSourceResearchArtifact: 'runs/action/artifacts/open-source-research.json',
    implementationGate: { actionExperimentRunId: 'action', requiredTerminalStage: 'ACTION_EXPERIMENT_APPROVED', selectedSlotRequired: true, status: 'REGISTERED_NOT_IMPLEMENTED' },
    isolatedActionExperiment: { workspaces: ['workspace/action-a', 'workspace/action-b', 'workspace/action-c'], chaseIncluded: false, formalArtIncluded: false },
    visualStandard: {
      status: 'HUMAN_APPROVED',
      referenceId: 'ui-f-night-market-interior',
      referenceImage: 'runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png',
      orientation: 'LANDSCAPE_16_9',
      rendering: 'MINIMAL_FLAT_2D',
      hud: {
        topLeft: 'TOKEN_STATUS_ONLY',
        topRight: 'DESTINATION_AND_PAUSE',
        center: 'UNOBSTRUCTED',
        pursuit: 'VISIBLE_GUARDS_AND_THIN_LEFT_EDGE_ALERT',
        persistentTutorial: false,
      },
      keep: ['horizontal-lookahead', 'small-readable-characters', 'three-visible-grapple-nodes', 'minimal-corner-hud', 'covered-night-market-interior', 'minimal-flat-character-silhouettes'],
      avoid: ['portrait-layout', 'ornate-frames', 'scrolls-seals-calligraphy', 'poster-composition', 'dense-market-detail', 'open-sky-traversal', 'anime-detailed-protagonist', 'realistic-uniformed-guards', 'character-identity-drift'],
      characterIdentity: {
        enforcement: 'STRICT_REFERENCE',
        referenceImage: 'runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png',
        referenceSha256: 'adb2a97b3f72d9233aa807a3f7833d4f2633c6e3210b570750ded32c04f2c3eb',
        protagonist: ['near-solid-blue-black-silhouette', 'short-vermilion-scarf', 'tiny-copper-waist-accent'],
        pursuer: ['near-solid-blue-black-silhouette', 'tiny-vermilion-headband', 'compact-low-running-pose', 'short-low-held-weapon'],
        forbiddenDrift: ['readable-face-or-skin', 'anime-rendering', 'realistic-costume-detail', 'spear-guard-redesign'],
      },
    },
    environment: {
      spatialSetting: 'COVERED_NIGHT_MARKET_INTERIOR',
      openSkyTraversal: false,
      enclosure: ['continuous-canopies', 'overhead-crossbeams', 'stall-walls', 'interior-columns'],
      routes: {
        high: ['awning-rafters', 'interior-balconies', 'paifang-crossbeams'],
        low: ['stall-aisles', 'covered-alley', 'counter-passages'],
      },
      architecturalObstacles: [
        { id: 'barricade', expression: 'closing-stall-shutter', anchoredTo: 'stall-frame' },
        { id: 'roof-net', expression: 'beam-hung-cargo-net', anchoredTo: 'overhead-crossbeam' },
        {
          id: 'closing-gate',
          expression: 'inner-market-gate',
          anchoredTo: 'market-exit-arch',
          collision: 'SOLID_LEAVES_LIVE_APERTURE',
          success: 'PLAYER_CROSSES_LIVE_APERTURE_ON_BEAT_3',
          closureMotion: 'HORIZONTAL_DOUBLE_LEAVES_INWARD',
          motionReference: 'FIXED_MARKET_EXIT_ARCH_WORLD_GEOMETRY',
        },
      ],
    },
    narrative: { protagonist: '护送盟契铜符的游侠', objective: '坊门关闭前抵达渡口', pursuer: '执行宵禁的官兵' },
    controls: { hold: '按住飞索', release: '松手保留动量', attackButtonIncluded: false, grappleNodes: ['檐角', '牌楼横梁', '灯绳架', '幌杆'] },
    criticalPath: [
      { order: 1, id: 'safe-tutorial', purpose: '摊棚街安全教学' },
      { order: 2, id: 'first-pursuit', purpose: '布幌巷首次官兵追入' },
      { order: 3, id: 'route-alternation', purpose: '牌楼与屋檐高低路线交替' },
      { order: 4, id: 'gate-climax', purpose: '坊门关闭前固定三拍高潮' },
    ],
    routes: {
      high: { surfaces: ['屋檐', '牌楼'], benefit: '速度快', risk: '可挂窗口短' },
      low: { surfaces: ['摊棚', '窄巷'], benefit: '安全并短暂甩开视线', risk: '推车横杆人群' },
    },
    terrain: [
      { kind: '布棚', behavior: '承接后滑落', teachingOrder: 'SAFE_THEN_CHASE' },
      { kind: '竹架', behavior: '暂时折断', teachingOrder: 'SAFE_THEN_CHASE' },
      { kind: '窄巷', behavior: '短暂降低追捕压力', teachingOrder: 'SAFE_THEN_CHASE' },
    ],
    chase: {
      visiblePursuerRequired: true,
      abstractMeterPrimary: false,
      phoneLeftEdgePresence: '手机左缘常驻官兵',
      closesDistanceOn: ['撞障碍', '错过挂点', '滞空失败'],
      opensDistanceOn: ['连续漂亮飞越', '利用捷径'],
      events: [
        { id: 'barricade', test: '路障逼走高线', allowedInput: 'HOLD_RELEASE_ONLY' },
        { id: 'roof-net', test: '抛网逼提前松手', allowedInput: 'HOLD_RELEASE_ONLY' },
        { id: 'closing-gate', test: '关坊门时机测试', allowedInput: 'HOLD_RELEASE_ONLY' },
      ],
    },
    originality: { copyThirdPartyExpression: false, copyThirdPartyBalanceValues: false },
  },
  research: {
    schemaVersion: 1,
    researchId: 'research',
    targetGame: '夜市飞侠：护印突围',
    targetWorkspace: 'runs/mobile-chart-adaptation-20260830/workspace/prototype-a',
    researchedAt: '2026-08-30T00:00:00.000Z',
    candidates: [{
      name: 'Phaser', repositoryUrl: 'https://example.com/repo', immutableRevision: 'v1.0.0', version: 'v1.0.0', directLicenseEvidence: 'https://example.com/license', licenseSpdx: 'MIT',
      targetPlatformFit: {
        webLite: { verdict: 'APPROVED', evidence: 'browser QA only' },
        wechatMiniGame: { verdict: 'REJECTED', evidence: 'not validated' },
        douyinMiniGame: { verdict: 'REJECTED', evidence: 'not validated' },
        tapTapMiniGame: { verdict: 'REJECTED', evidence: 'not validated' },
      },
      maintenanceRisk: 'LOW', securityRisk: 'LOW', attributionDuties: ['retain license'], decision: 'REUSE', approvedScope: ['web-lite QA'], rationale: 'pinned dependency',
    }],
    conclusion: { approvedCandidateNames: ['Phaser'], rejectedCandidateNames: [], noSuitablePlatformAdapter: true, architectureDecision: 'web-lite QA only' },
  },
  actionSelection: {
    runId: 'action',
    decision: 'KEEP',
    selectedSlot: 'B',
    selectedWorkspace: 'runs/action/workspace/action-b',
    treatment: ['distance weight 75%', 'direction weight 25%'],
  },
};

describe('formal prototype BuilderAgent workflow', () => {
  it('delegates the one authorized workspace write, then verifies lint, typecheck, tests, contract, and build', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'formal-prototype-'));
    roots.push(workspace);
    const calls: Array<FormalPrototypeBuildInput & { workspace: string }> = [];
    const provider: CodexProvider = {
      async formalPrototype(received) {
        calls.push(received);
        await mkdir(path.join(workspace, 'dist'), { recursive: true });
        await writeFile(path.join(workspace, 'dist/index.html'), '<script>window.__FORMAL_TEST__={contractVersion:1}</script>');
        return { threadId: 'formal-thread', verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };
    const runtime = {
      async verifyFormalProject(receivedWorkspace: string) {
        expect(receivedWorkspace).toBe(workspace);
        return ['lint:passed', 'typecheck:passed', 'test:passed', 'formal-test-contract:v1'];
      },
      async buildWeb(receivedWorkspace: string) {
        expect(receivedWorkspace).toBe(workspace);
        return path.join(workspace, 'dist');
      },
    } as RuntimeAdapter;

    const result = await new BuilderAgent(provider, runtime).implementFormalPrototype(workspace, input);

    expect(calls).toEqual([{ ...input, workspace }]);
    expect(result.report).toMatchObject({
      schemaVersion: 1,
      status: 'BUILT',
      game: '夜市飞侠：护印突围',
      workspace: input.constraints.targetWorkspace,
      selectedActionSlot: 'B',
      author: 'BuilderAgent',
      codexThreadId: 'formal-thread',
      verification: ['lint:passed', 'typecheck:passed', 'test:passed', 'formal-test-contract:v1'],
    });
  });

  it('lets FixerAgent repair a formal prototype with the formal verifier instead of the idle-shop verifier', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'formal-fixer-'));
    roots.push(workspace);
    const calls: string[] = [];
    const provider: CodexProvider = {
      async build() { throw new Error('not used'); },
      async fix(received) {
        expect(received.workspace).toBe(workspace);
        expect(received.threadId).toBe('formal-thread');
        expect(received.qaReport.passed).toBe(false);
        calls.push('fix');
        return {
          threadId: 'formal-thread',
          summary: 'fixed explicit formal QA issues',
          verificationMode: 'full',
          metrics: { provider: 'test', model: 'test', calls: 1 },
        };
      },
    };
    const runtime = {
      async verifyFormalProject(receivedWorkspace: string) {
        expect(receivedWorkspace).toBe(workspace);
        calls.push('verify-formal');
        return ['lint:passed', 'typecheck:passed', 'test:passed', 'formal-test-contract:v1'];
      },
      async buildWeb(receivedWorkspace: string) {
        expect(receivedWorkspace).toBe(workspace);
        calls.push('build-web');
        return path.join(workspace, 'dist');
      },
    } as RuntimeAdapter;

    const result = await new FixerAgent(provider, runtime).runFormal(workspace, 'formal-thread', {
      schemaVersion: 1,
      passed: false,
      checks: [{ name: 'formal-visible-obstacles', passed: false, evidence: 'screenshots/before.png' }],
      issues: [{ id: 'formal-visible-obstacles', severity: 'error', message: 'visible chase obstacles are missing', evidence: 'screenshots/before.png' }],
      screenshots: ['screenshots/before.png'],
      consoleLog: 'logs/console.log',
      testedAt: '2026-08-30T00:00:00.000Z',
    });

    expect(calls).toEqual(['fix', 'verify-formal', 'build-web']);
    expect(result).toMatchObject({
      threadId: 'formal-thread',
      summary: 'fixed explicit formal QA issues',
      verification: ['lint:passed', 'typecheck:passed', 'test:passed', 'formal-test-contract:v1'],
      webBuild: path.join(workspace, 'dist'),
    });
  });
});

class FakeExecutor implements CodexExecutor {
  readonly requests: CodexExecRequest[] = [];
  async assertChatGptLogin() { return { method: 'chatgpt' as const, message: 'logged in' }; }
  async execute(request: CodexExecRequest): Promise<CodexExecResult> {
    this.requests.push(request);
    return { events: [], threadId: 'formal-thread', completed: true, failed: false, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, errors: [], output: 'done', attempts: 1, stdout: '', stderr: '' };
  }
}

it('gives the formal Builder the exact level, pursuit, originality, and test-first constraints', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'formal-prompt-'));
  roots.push(workspace);
  const client = new FakeExecutor();

  await new CodexAccountProvider(client).formalPrototype({ ...input, workspace });

  expect(client.requests[0]).toMatchObject({ label: 'FORMAL_PROTOTYPE_FOLLOWUP', cwd: workspace, runRoot: path.resolve(workspace, '../..'), stage: 'FULL_BUILD', role: 'builder', sandbox: 'workspace-write', maxRetries: 0 });
  const prompt = client.requests[0]?.prompt ?? '';
  expect(prompt).toMatch(/BuilderAgent/);
  expect(prompt).toMatch(/only.*supplied.*validated.*constraints/i);
  expect(prompt).toMatch(/ui-f-night-market-interior.*LANDSCAPE_16_9.*MINIMAL_FLAT_2D/s);
  expect(prompt).toMatch(/do not infer.*visual/i);
  expect(prompt).toMatch(/covered night-market interior/i);
  expect(prompt).toMatch(/no open-sky traversal/i);
  expect(prompt).toMatch(/architectural obstacles.*anchored/i);
  expect(prompt).toMatch(/exactly.*布棚.*竹架.*窄巷.*bamboo scaffold.*restored/is);
  expect(prompt).toMatch(/stall shutter.*full.*blocking/is);
  expect(prompt).toMatch(/gate beat 3.*perceivable.*24 fixed ticks/is);
  expect(prompt).toMatch(/solid gate leaves.*live aperture.*cannot pass through.*victory.*crosses.*live aperture/is);
  expect(prompt).toMatch(/horizontal.*left.*right.*inward.*not.*top.*bottom/is);
  expect(prompt).toMatch(/fixed world.*exit arch.*not.*player progress.*hold.*release.*collision.*browser.*screenshot/is);
  expect(prompt).toMatch(/do not modify.*chaseIncluded.*formalArtIncluded/is);
  expect(prompt).toMatch(/test-first/i);
  expect(prompt).toMatch(/safe-tutorial.*first-pursuit.*route-alternation.*gate-climax/s);
  expect(prompt).toMatch(/SAFE_THEN_CHASE/);
  expect(prompt).toMatch(/visible.*pursuer/i);
  expect(prompt).toMatch(/left edge/i);
  expect(prompt).toMatch(/barricade.*roof-net.*closing-gate/s);
  expect(prompt).toMatch(/hold.*release only/i);
  expect(prompt).toMatch(/no attack/i);
  expect(prompt).toMatch(/ui-f-night-market-interior/);
  expect(prompt).toMatch(/ui-concepts-landscape-v3\/ui-f-night-market-interior\.png/);
  expect(prompt).toMatch(/STRICT_REFERENCE/);
  expect(prompt).toMatch(/adb2a97b3f72d9233aa807a3f7833d4f2633c6e3210b570750ded32c04f2c3eb/);
  expect(prompt).toMatch(/near-solid-blue-black-silhouette/);
  expect(prompt).toMatch(/anime-detailed-protagonist.*realistic-uniformed-guards/s);
  expect(prompt).toMatch(/LANDSCAPE_16_9/);
  expect(prompt).toMatch(/MINIMAL_FLAT_2D/);
  expect(prompt).toMatch(/portrait-layout.*ornate-frames/s);
  expect(prompt).toMatch(/window\.__FORMAL_TEST__/);
  expect(prompt).toMatch(/do not add or upgrade dependencies/i);
  expect(prompt).toMatch(/web-lite.*QA.*not.*(?:WeChat|Douyin|TapTap).*publish/i);
  expect(prompt).toContain('uiAnimationStandard');
  expect(prompt).toContain('key-poses-plus-runtime-motion');
  expect(prompt).toMatch(/never generate independent ai images for every in-between frame/i);
  expect(prompt).toContain('prefers-reduced-motion');
  expect(prompt).toMatch(/lint.*typecheck.*tests.*build/i);
  expect(prompt).toMatch(/classic inlined script.*no top-level await.*browser smoke.*__PROTOTYPE_TEST__.*__FORMAL_TEST__/is);
});
