import { describe, expect, it } from 'vitest';

type SchemaModule = typeof import('../../src/schemas/narrative-life-prototype.js');

async function loadSchema(): Promise<SchemaModule | null> {
  return import('../../src/schemas/narrative-life-prototype.js').catch(() => null);
}

const statIds = ['economy', 'skill', 'health', 'bonds'] as const;

function textRegistry() {
  const entries: Record<string, string> = {
    stat_economy: '家底',
    stat_skill: '本事',
    stat_health: '身体',
    stat_bonds: '人情',
  };
  for (let index = 1; index <= 24; index += 1) {
    const suffix = String(index).padStart(2, '0');
    entries[`event_${suffix}_title`] = `事件${index}`;
    entries[`event_${suffix}_body`] = `这是第${index}张选择卡。`;
    for (const choice of ['a', 'b']) {
      entries[`event_${suffix}_${choice}_label`] = `选择${choice}`;
      entries[`event_${suffix}_${choice}_result`] = `选择${choice}的即时结果。`;
      entries[`event_${suffix}_${choice}_echo`] = `选择${choice}的延迟回声。`;
    }
  }
  for (let index = 1; index <= 12; index += 1) {
    const suffix = String(index).padStart(2, '0');
    entries[`ending_${suffix}_title`] = `结局${index}`;
    entries[`ending_${suffix}_summary`] = `结局${index}的人生总结。`;
    entries[`ending_${suffix}_reflection`] = `结局${index}的回望。`;
    entries[`ending_${suffix}_path`] = `通往结局${index}的可达路径。`;
  }
  for (let index = 1; index <= 3; index += 1) {
    entries[`keepsake_${index}_name`] = `旧物${index}`;
    entries[`keepsake_${index}_description`] = `旧物${index}的说明。`;
  }
  for (let index = 1; index <= 4; index += 1) entries[`chapter_${index}_title`] = `章节${index}`;
  return entries;
}

function artifact() {
  const events = Array.from({ length: 24 }, (_, offset) => {
    const index = offset + 1;
    const suffix = String(index).padStart(2, '0');
    const chapter = Math.floor(offset / 6) + 1;
    return {
      id: `event_${suffix}`,
      chapterId: `chapter_${chapter}`,
      year: 1978 + Math.floor((offset * 14) / 23),
      titleTextId: `event_${suffix}_title`,
      bodyTextId: `event_${suffix}_body`,
      sourceIds: ['history_rural_reform'],
      choices: [
        {
          id: `event_${suffix}_choice_a`,
          labelTextId: `event_${suffix}_a_label`,
          resultTextId: `event_${suffix}_a_result`,
          immediateEffects: { skill: 1 },
          setFlags: index <= 11 ? [`route_${suffix}`] : [`acted_${suffix}`],
          delayedEcho: {
            trigger: index >= 23 ? 'summary' : 'after_events',
            afterEvents: index >= 23 ? undefined : 1,
            textId: `event_${suffix}_a_echo`,
            effects: { bonds: 1 },
            setFlags: [`echo_${suffix}_a`],
          },
        },
        {
          id: `event_${suffix}_choice_b`,
          labelTextId: `event_${suffix}_b_label`,
          resultTextId: `event_${suffix}_b_result`,
          immediateEffects: { economy: 1 },
          setFlags: [`steady_${suffix}`],
          delayedEcho: {
            trigger: index >= 23 ? 'summary' : 'after_events',
            afterEvents: index >= 23 ? undefined : 1,
            textId: `event_${suffix}_b_echo`,
            effects: { health: 1 },
            setFlags: [`echo_${suffix}_b`],
          },
        },
      ],
    };
  });

  const endings = Array.from({ length: 12 }, (_, offset) => {
    const index = offset + 1;
    const suffix = String(index).padStart(2, '0');
    return {
      id: `ending_${suffix}`,
      titleTextId: `ending_${suffix}_title`,
      summaryTextId: `ending_${suffix}_summary`,
      reflectionTextId: `ending_${suffix}_reflection`,
      outcomeProfile: {
        trajectory: index === 12 ? 'ROOTED' : 'UPWARD',
        economicAgency: index === 12 ? 'HOUSEHOLD' : 'SELF_EMPLOYED',
        geographicReach: index === 12 ? 'VILLAGE' : 'COUNTY',
        riskLevel: index === 12 ? 'LOW' : 'MEDIUM',
      },
      priority: index === 12 ? 0 : 100 - index,
      fallback: index === 12,
      conditions: index === 12 ? {} : { allFlags: [`route_${suffix}`] },
    };
  });

  const neutralPath = events.map((event) => event.choices[1]!.id);
  const reachability = endings.map((ending, offset) => ({
    endingId: ending.id,
    choiceIds: offset === 11
      ? neutralPath
      : neutralPath.map((choiceId, eventOffset) => eventOffset === offset ? events[eventOffset]!.choices[0]!.id : choiceId),
    rationaleTextId: `ending_${String(offset + 1).padStart(2, '0')}_path`,
  }));

  return {
    schemaVersion: 1,
    prototypeId: 'village-south-text-v1',
    targetGame: '村口向南',
    targetWorkspace: 'runs/test-village-south/workspace/game',
    targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
    prototypeQuestion: '玩家能否感受到选择的延迟后果，并愿意再走一次人生？',
    format: 'throwaway_text_spike',
    timeboxMinutes: 90,
    sessionMinutes: { min: 10, max: 15 },
    mobileUiPolicy: {
      visibleStatIds: ['economy', 'skill', 'health', 'bonds'],
      maxPrimaryChoices: 2,
      unavailableChoiceBehavior: 'disabled_with_short_reason',
      hiddenContext: ['年代按章节自动推进', '地点、职业、负债和生产资料使用标签记录'],
    },
    historicalFrame: {
      startYear: 1978,
      endYear: 1992,
      fictionalSetting: '架空的河湾县东坪村',
      disclaimers: ['人物与村镇均为原创架空', '年代节点依据公开史料校对'],
      sourceIds: ['history_rural_reform'],
    },
    sources: [{
      id: 'history_rural_reform',
      kind: 'historical',
      title: '改革开放初期农村发展资料',
      url: 'https://www.stats.gov.cn/example',
      accessedAt: '2026-08-31T00:00:00+08:00',
    }],
    locale: 'zh-CN',
    strings: textRegistry(),
    stats: statIds.map((id) => ({ id, labelTextId: `stat_${id}`, initial: 5, min: 0, max: 30 })),
    keepsakes: Array.from({ length: 3 }, (_, offset) => ({
      id: `keepsake_${offset + 1}`,
      nameTextId: `keepsake_${offset + 1}_name`,
      descriptionTextId: `keepsake_${offset + 1}_description`,
      effects: { [statIds[offset]!]: 1 },
      setFlags: [`keepsake_${offset + 1}`],
    })),
    chapters: Array.from({ length: 4 }, (_, offset) => ({
      id: `chapter_${offset + 1}`,
      titleTextId: `chapter_${offset + 1}_title`,
      eventIds: events.slice(offset * 6, offset * 6 + 6).map(({ id }) => id),
    })),
    events,
    endings,
    reachability,
    iaaPrototypePolicy: {
      included: false,
      rationale: '文本原型只验证选择与延迟回声，不让广告污染核心玩法结论。',
    },
    keepCriteria: ['新玩家能在30秒内理解选择与回声', '完成后愿意主动再开一局'],
    killCriteria: ['选择只表现为当下数值加减', '不解释系统就无法理解为何到达结局'],
  };
}

describe('NarrativeLifePrototypeSchema', () => {
  it('is exported through the shared schema entry point', async () => {
    const module = await loadSchema();
    const shared = await import('../../src/schemas/index.js');
    expect(shared.NarrativeLifePrototypeSchema).toBe(module?.NarrativeLifePrototypeSchema);
    expect(Reflect.get(shared, 'isNarrativeChoiceAvailable')).toBe(module?.isNarrativeChoiceAvailable);
  });

  it('validates exactly 24 event cards, 12 endings, and one reachable path per ending', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const parsed = module.NarrativeLifePrototypeSchema.parse(artifact());
    expect(parsed.events).toHaveLength(24);
    expect(parsed.endings).toHaveLength(12);
    expect(parsed.stats.map(({ id }) => id)).toEqual(['economy', 'skill', 'health', 'bonds']);
    expect(parsed.events.every(({ choices }) => choices.length === 2)).toBe(true);
    expect(parsed.mobileUiPolicy.maxPrimaryChoices).toBe(2);
    expect(parsed.reachability.map(({ endingId }) => endingId).sort()).toEqual(parsed.endings.map(({ id }) => id).sort());
    for (const path of parsed.reachability) expect(module.resolveNarrativeEnding(parsed, path.choiceIds).ending.id).toBe(path.endingId);
  });

  it('exposes a structured possibility profile for every life ending', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const parsed = module.NarrativeLifePrototypeSchema.parse(artifact());
    expect(parsed.endings.every((ending) => Reflect.has(ending, 'outcomeProfile'))).toBe(true);
  });

  it('exports a state-aware choice availability evaluator for the mobile runner', async () => {
    const module = await loadSchema();
    expect(typeof Reflect.get(module ?? {}, 'isNarrativeChoiceAvailable')).toBe('function');
  });

  it('rejects replacing one of the four compact mobile systems with an extra meter', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    Reflect.set(value.stats[0]!, 'id', 'household');
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/economy|health|bonds|system|stat/i);
  });

  it('rejects a chapter that does not own exactly six unique event cards', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    value.chapters[0]!.eventIds.pop();
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/six|6|chapter/i);
  });

  it('rejects a choice without immediate change and a delayed echo', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    const choice = value.events[0]!.choices[0]!;
    Reflect.set(choice, 'immediateEffects', {});
    Reflect.deleteProperty(choice, 'delayedEcho');
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/immediate|effect|echo/i);
  });

  it('rejects more than two main choices on a mobile event card', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    const thirdChoice = structuredClone(value.events[0]!.choices[1]!);
    thirdChoice.id = 'event_01_choice_c';
    value.events[0]!.choices.push(thirdChoice);
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/two|2|choice|mobile/i);
  });

  it('requires a short unavailable reason whenever a choice has state requirements', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    Reflect.set(value.events[0]!.choices[0]!, 'requirements', { stats: { skill: { min: 5 } } });
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/unavailable|require|reason/i);
  });

  it('rejects an event with no unconditional mobile fallback choice', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    for (const [index, choice] of value.events[0]!.choices.entries()) {
      const textId = `event_01_${index}_unavailable`;
      value.strings[textId] = '当前状态不足';
      Reflect.set(choice, 'requirements', { stats: { economy: { min: 0 } } });
      Reflect.set(choice, 'unavailableTextId', textId);
    }
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/unconditional|fallback|choice/i);
  });

  it('rejects reachability evidence that selects a currently unavailable choice', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    value.strings.event_01_a_unavailable = '本事不足，暂时看不懂机器';
    Reflect.set(value.events[0]!.choices[0]!, 'requirements', { stats: { skill: { min: 6 } } });
    Reflect.set(value.events[0]!.choices[0]!, 'unavailableTextId', 'event_01_a_unavailable');
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/available|require|reach/i);
  });

  it('rejects reachability evidence that does not actually resolve to the claimed ending', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    value.reachability[0]!.choiceIds = value.reachability[11]!.choiceIds;
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/reach|ending|resolve/i);
  });

  it('rejects missing string-table and source references', async () => {
    const module = await loadSchema();
    expect(module).not.toBeNull();
    if (!module) return;
    const value = artifact();
    Reflect.deleteProperty(value.strings, 'event_01_title');
    value.events[0]!.sourceIds = ['missing_source'];
    expect(() => module.NarrativeLifePrototypeSchema.parse(value)).toThrow(/string|source|reference/i);
  });
});
