import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAccountProvider, type CodexExecutor } from '../../src/providers/codex-account.js';
import type { CodexExecRequest, CodexExecResult } from '../../src/providers/codex-cli.js';
import type { GameBlueprint, GameplayRevisionLock, StyleLock } from '../../src/schemas/index.js';

class CapturingExecutor implements CodexExecutor {
  request?: CodexExecRequest;
  async assertChatGptLogin() { return { method: 'chatgpt' as const, message: 'Logged in using ChatGPT' }; }
  async execute(request: CodexExecRequest): Promise<CodexExecResult> {
    this.request = request;
    return {
      events: [],
      threadId: 'revision-builder-thread',
      completed: true,
      failed: false,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      errors: [],
      output: 'implemented',
      attempts: 1,
      stdout: '',
      stderr: '',
    };
  }
}

describe('Builder prompt for an approved gameplay revision', () => {
  it('treats the revision as the latest lock and enforces progressive disclosure', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'gameplay-revision-builder-'));
    const executor = new CapturingExecutor();
    const provider = new CodexAccountProvider(executor);
    const blueprint = {
      schemaVersion: 1,
      gameId: 'princess-reversal',
      title: '逆袭公主',
      theme: '都市成长',
      runtime: 'web-lite',
      template: 'idle-shop-v1',
      designMode: 'reference_reskin',
      referenceMechanics: { lockedBy: 'human' },
      gameplayRevision: {
        artifactPath: 'artifacts/gameplay-revision-lock-v4.json',
        revisionId: 'princess-identity-growth-v4',
        targetRunId: '20260830141456-e0aac979',
        title: '逆袭公主',
      },
      targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
      concept: '具体动作与渐进解锁',
      coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
      content: { productName: '动作', customerName: '女孩', currencyName: '成长值' },
      balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 },
      preferences: {
        visual_delivery: {
          current_demo: 'mechanics_demo_placeholder_only',
          approved_formal_direction: '干净扁平矢量',
          forbidden_legacy_direction: '折页纸艺',
          formal_style_lock_status: 'pending_new_lock',
        },
      },
    } as unknown as GameBlueprint;
    const gameplayRevision = {
      revisionId: 'princess-identity-growth-v4',
      narrativeDirection: {
        premise: '一名普通女孩意外确认自己本来就是公主与王位继承人，经历王室训练、双重生活和首次公开亮相后，自主公开接受公主身份。',
        storyCardsMaxLines: 3,
        storyCardsAreSkippable: true,
        gameplayRemainsPrimary: true,
        originalExpressionOnly: true,
      },
      progressiveDisclosure: {
        maximumSimultaneousDecisions: 3,
        showCurrentAction: true,
        showNextAction: true,
        showNextChapterPreview: true,
      },
      contentRules: { forbiddenAbstractLabels: ['晨光舒展', '白天防护'] },
      chapters: [{ id: 'social', requireAll: [{ activityId: 'study', minimumLevel: 3 }, { activityId: 'work', minimumLevel: 2 }] }, { id: 'romance', requireAll: [{ activityId: 'social', minimumLevel: 3 }, { activityId: 'work', minimumLevel: 3 }] }],
    } as unknown as GameplayRevisionLock;
    const styleLock = {
      schemaVersion: 1,
      directionId: 'placeholder',
      direction: {
        id: 'direction_a',
        name: 'placeholder',
        summary: 'placeholder mechanics skin',
        visualKeywords: ['placeholder'],
        palette: ['#112233'],
        characterStyle: 'placeholder',
        environmentStyle: 'placeholder',
        uiStyle: 'placeholder',
        iconConcept: 'placeholder',
        forbiddenElements: [],
        productionComplexity: 'low',
        previewPrompt: 'placeholder',
      },
      kept: [],
      changes: [],
      notes: [],
      lockedAt: '2026-08-31T02:00:00.000Z',
    } as StyleLock;

    await provider.build({
      workspace,
      blueprint,
      styleLock,
      assets: {
        schemaVersion: 1,
        provider: 'placeholder',
        assets: ['customer', 'product', 'background', 'upgrade'].map((id, index) => ({
          id,
          kind: (['character', 'product', 'background', 'ui'] as const)[index]!,
          path: `assets/${id}.png`,
          prompt: id,
          status: 'generated' as const,
          sha256: 'hash',
        })),
      },
      template: 'idle-shop-v1',
      gameplayRevision,
    });

    const prompt = executor.request?.prompt ?? '';
    expect(prompt).toMatch(/latest approved gameplay revision.*supersedes.*older.*mechanic/i);
    expect(prompt).toMatch(/current action.*next action.*next chapter/i);
    expect(prompt).toMatch(/no more than three.*decision/i);
    expect(prompt).toMatch(/abstract.*forbidden/i);
    expect(prompt).toMatch(/social.*romance.*all.*requirements/i);
    expect(prompt).toMatch(/already.*princess.*royal heir.*royal training.*double life.*public debut.*accept.*title/i);
    expect(prompt).toMatch(/do not substitute.*candidate selection.*community project/i);
    expect(prompt).toMatch(/story cards.*skippable.*gameplay.*primary/i);
    expect(prompt).toMatch(/do not copy.*third-party.*names.*dialogue.*scene/i);
    expect(prompt).toMatch(/mechanics-only demo.*legacy style lock.*not final/i);
    expect(prompt).toMatch(/in-code placeholders/i);
    expect(prompt).toMatch(/clean flat vector/i);
    expect(prompt).toMatch(/player-visible product evidence/i);
    expect(prompt).toMatch(/natural trigger evidence/i);
    expect(prompt).toMatch(/runtimeWired.*playerVisible.*naturalTriggerVerified/i);
    expect(prompt).toMatch(/game-feel.*game-ui-ux/i);
    expect(prompt).toMatch(/competitor.*core loop.*failure.*recovery/i);
    expect(prompt).toMatch(/failure-pressure.*structure|pressure.*hazards.*timing.*resource loss/i);
    expect(prompt).toMatch(/natural.*fall|gravity.*settle|physics.*readable/i);
    expect(prompt).toMatch(/3D.*mesh.*collider.*penetration|continuous collision detection/i);
    expect(prompt).toMatch(/object type.*lifecycle.*state branch.*renderer.*viewport/i);
    expect(prompt).toMatch(/sibling branch.*not coverage/i);
  });
});
