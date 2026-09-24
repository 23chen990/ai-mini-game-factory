import path from 'node:path';
import { exists, readJson, sha256Text, writeJsonAtomic } from './files.js';
import type { RequestRouter } from './request-router.js';
import type { FileRunStore } from './run-store.js';
import { DesignLessonsSchema, FeedbackRecordSchema, type DesignLesson, type DesignLessons, type FeedbackRecord, type LessonAgent } from '../schemas/index.js';
import { FeedbackRegressionCasesSchema, StructuredFeedbackSchema, type FeedbackRegressionCase, type FeedbackRegressionCases, type StructuredFeedback } from '../schemas/feedback.js';

const reusablePattern = /(?:以后|每次|后续|所有项目|通用|可复用|沉淀|经验|不要再|工厂|流程|Agent\s*自动读取)/iu;
const currentProjectPattern = /(?:当前|现在|本次|这个游戏|该游戏|这款游戏|现有)/iu;

function splitFeedback(feedback: string): string[] {
  return feedback.split(/[。！？!?\n]+/u).map((item) => item.trim()).filter(Boolean);
}

function tagsFor(text: string): DesignLesson['tags'] {
  const tags: DesignLesson['tags'] = [];
  if (/(?:玩法|核心循环|选择|成长|目标|随机|有趣|无聊|gameplay|mechanic)/iu.test(text)) tags.push('gameplay');
  if (/(?:制作成本|开发成本|代码量|美术量|内容量|低成本|换主题复用|production\s*cost|cost\s*review)/iu.test(text)) tags.push('production_cost');
  if (/(?:广告|激励|插屏|变现|IAA|monetization)/iu.test(text)) tags.push('iaa');
  if (/(?:绿灯|立项|值得做|greenlight)/iu.test(text)) tags.push('greenlight');
  if (/(?:QA|测试|试玩|交付|打不开|质量)/iu.test(text)) tags.push('qa');
  if (/(?:美术|视觉|画面|art|visual)/iu.test(text)) tags.push('art');
  if (/(?:反馈|经验|design-lessons|Agent|工厂流程|自动读取)/iu.test(text)) tags.push('general');
  return tags.length ? tags : ['general'];
}

function agentsFor(tags: DesignLesson['tags']): LessonAgent[] {
  const agents = new Set<LessonAgent>();
  const add = (...items: LessonAgent[]) => items.forEach((item) => agents.add(item));
  if (tags.includes('gameplay')) add('CompetitorResearchAgent', 'GameDesignerAgent', 'GreenlightAgent', 'BuilderAgent', 'PlaytestAgent');
  if (tags.includes('production_cost')) add('ProductionCostReviewer', 'GreenlightAgent', 'BuilderAgent');
  if (tags.includes('iaa')) add('IAAReviewer', 'GreenlightAgent', 'GameDesignerAgent', 'BuilderAgent', 'PlaytestAgent');
  if (tags.includes('greenlight')) add('CompetitorResearchAgent', 'ProductionCostReviewer', 'IAAReviewer', 'GreenlightAgent', 'GameDesignerAgent');
  if (tags.includes('qa')) add('BuilderAgent', 'PlaytestAgent');
  if (tags.includes('art')) add('GameDesignerAgent', 'BuilderAgent', 'PlaytestAgent');
  if (tags.includes('general')) add('CompetitorResearchAgent', 'GameDesignerAgent', 'ProductionCostReviewer', 'IAAReviewer', 'GreenlightAgent', 'BuilderAgent', 'PlaytestAgent');
  return [...agents];
}

export class FeedbackLessonsLoop {
  private readonly libraryFile: string;
  private readonly regressionFile: string;

  constructor(private readonly root: string, private readonly store: FileRunStore, private readonly router: RequestRouter) {
    this.libraryFile = path.join(root, 'design-lessons/index.json');
    this.regressionFile = path.join(root, 'factory-eval/feedback-regressions.json');
  }

  private async readLibrary(): Promise<DesignLessons> {
    return await exists(this.libraryFile) ? DesignLessonsSchema.parse(await readJson(this.libraryFile)) : { schemaVersion: 1, lessons: [] };
  }

  private async readRegressionCases(): Promise<FeedbackRegressionCases> {
    return await exists(this.regressionFile)
      ? FeedbackRegressionCasesSchema.parse(await readJson(this.regressionFile))
      : FeedbackRegressionCasesSchema.parse({ schemaVersion: 1, cases: [], updatedAt: new Date(0).toISOString() });
  }

  async record(runId: string, rawFeedback: string): Promise<FeedbackRecord> {
    await this.store.load(runId);
    const normalized = rawFeedback.trim();
    const feedbackId = sha256Text(`${runId}\n${normalized}`).slice(0, 16);
    const artifactFile = this.store.artifact(runId, `feedback/${feedbackId}.json`);
    if (await exists(artifactFile)) return FeedbackRecordSchema.parse(await readJson(artifactFile));
    const clauses = splitFeedback(normalized);
    const reusable = clauses.filter((clause) => reusablePattern.test(clause));
    const projectChanges = clauses.filter((clause) => currentProjectPattern.test(clause) || !reusablePattern.test(clause));
    const library = await this.readLibrary();
    const now = new Date().toISOString();
    const reusableLessons: DesignLesson[] = [];
    for (const text of reusable) {
      const lessonId = sha256Text(text.replace(/\s+/gu, ' ').toLowerCase()).slice(0, 16);
      const existing = library.lessons.find((lesson) => lesson.lessonId === lessonId);
      if (existing) {
        existing.occurrences += 1;
        existing.lastSeenAt = now;
        if (!existing.sourceRunIds.includes(runId)) existing.sourceRunIds.push(runId);
        reusableLessons.push(existing);
      } else {
        const tags = tagsFor(text);
        const lesson: DesignLesson = { lessonId, text, tags, appliesTo: agentsFor(tags), sourceRunIds: [runId], occurrences: 1, createdAt: now, lastSeenAt: now };
        library.lessons.push(lesson);
        reusableLessons.push(lesson);
      }
    }
    const projectRoute = projectChanges.length ? this.router.route({ request: projectChanges.join('。'), targetRunId: runId }) : null;
    const record = FeedbackRecordSchema.parse({ schemaVersion: 1, feedbackId, runId, rawFeedback: normalized, projectChanges, projectRoute, reusableLessons, recordedAt: now });
    await writeJsonAtomic(this.libraryFile, DesignLessonsSchema.parse(library));
    await writeJsonAtomic(artifactFile, record);
    await this.store.log(runId, 'feedback.recorded', { feedbackId, projectChanges: projectChanges.length, reusableLessons: reusableLessons.map((lesson) => lesson.lessonId) });
    return record;
  }

  async snapshot(runId: string, agent: LessonAgent): Promise<string> {
    await this.store.load(runId);
    const relative = `artifacts/design-lessons/${agent}.json`;
    const library = await this.readLibrary();
    const lessons = library.lessons.filter((lesson) => lesson.appliesTo.includes(agent));
    await writeJsonAtomic(path.join(this.store.runRoot(runId), relative), DesignLessonsSchema.parse({ schemaVersion: 1, lessons }));
    return relative;
  }

  /** Persist the user's before/after judgement as a regression-oriented lesson. */
  async recordStructured(runId: string, input: StructuredFeedback): Promise<FeedbackRecord> {
    await this.store.load(runId);
    const structured = StructuredFeedbackSchema.parse(input);
    const normalized = JSON.stringify(structured);
    const feedbackId = sha256Text(`${runId}\nstructured\n${normalized}`).slice(0, 16);
    const artifactFile = this.store.artifact(runId, `feedback/${feedbackId}.json`);
    if (await exists(artifactFile)) return FeedbackRecordSchema.parse(await readJson(artifactFile));
    const now = new Date().toISOString();
    const lessonText = `[${structured.rejected_dimension}] ${structured.reason}; accepted: ${structured.accepted_result}; regression: ${structured.new_regression_case}`;
    const tags: DesignLesson['tags'] = structured.rejected_dimension === 'feel' || structured.rejected_dimension === 'core' ? ['gameplay', 'qa'] : structured.rejected_dimension === 'narrative' ? ['gameplay'] : structured.rejected_dimension === 'platform' || structured.rejected_dimension === 'monetization' ? [structured.rejected_dimension === 'platform' ? 'qa' : 'iaa'] : structured.rejected_dimension === 'visual' || structured.rejected_dimension === 'ui' ? ['art'] : ['general'];
    const lesson: DesignLesson = { lessonId: sha256Text(lessonText.toLowerCase()).slice(0, 16), text: lessonText, tags, appliesTo: agentsFor(tags), sourceRunIds: [runId], occurrences: 1, createdAt: now, lastSeenAt: now };
    const library = await this.readLibrary();
    const existing = library.lessons.find((item) => item.lessonId === lesson.lessonId);
    if (existing) { existing.occurrences += 1; existing.lastSeenAt = now; if (!existing.sourceRunIds.includes(runId)) existing.sourceRunIds.push(runId); }
    else library.lessons.push(lesson);
    const reusableLessons = [existing ?? lesson];
    const record = FeedbackRecordSchema.parse({ schemaVersion: 1, feedbackId, runId, rawFeedback: structured.reason, projectChanges: [], projectRoute: null, reusableLessons, structuredFeedback: structured, recordedAt: now });
    const regressionCases = await this.readRegressionCases();
    const regressionId = sha256Text(`${structured.project}\n${structured.artifact_version}\n${structured.new_regression_case}`).slice(0, 16);
    if (!regressionCases.cases.some((item) => item.regressionId === regressionId)) {
      const regression: FeedbackRegressionCase = FeedbackRegressionCasesSchema.shape.cases.element.parse({
        schemaVersion: 1,
        regressionId,
        sourceRunId: runId,
        project: structured.project,
        artifact_version: structured.artifact_version,
        rejected_dimension: structured.rejected_dimension,
        reason: structured.reason,
        before: structured.before,
        after: structured.after,
        accepted_result: structured.accepted_result,
        new_regression_case: structured.new_regression_case,
        ...(structured.regression_eval ? { evalCase: structured.regression_eval } : {}),
        createdAt: now,
      });
      regressionCases.cases.push(regression);
      regressionCases.updatedAt = now;
      await writeJsonAtomic(this.regressionFile, FeedbackRegressionCasesSchema.parse(regressionCases));
    }
    await writeJsonAtomic(this.libraryFile, DesignLessonsSchema.parse(library));
    await writeJsonAtomic(artifactFile, record);
    await this.store.log(runId, 'feedback.structured-recorded', { feedbackId, rejectedDimension: structured.rejected_dimension, regression: structured.new_regression_case });
    return record;
  }
}
