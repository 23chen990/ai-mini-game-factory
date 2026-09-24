import type { StageName } from '../schemas/index.js';

const EXPERIENCE_SKILLS = ['game-feel', 'game-ui-ux', 'critique', 'game-playtest'] as const;
export type ExperienceSkill = typeof EXPERIENCE_SKILLS[number];

/** Select complementary product skills while leaving model selection to model-policy.ts. */
export function routeExperienceSkills(input: { stage: StageName | string; request?: string }): ExperienceSkill[] {
  const text = `${input.stage} ${input.request ?? ''}`.toLowerCase();
  const selected = new Set<ExperienceSkill>();
  if (/(build|full_build|feel|action|physics|motion|combo|release|feedback)/u.test(text)) selected.add('game-feel');
  if (/(build|full_build|ui|hud|settlement|readab|visible|screenshot)/u.test(text)) selected.add('game-ui-ux');
  if (/(qa|review|critique|acceptance|presentation|visible|understand)/u.test(text)) selected.add('critique');
  if (/(qa|playtest|natural|journey|trigger|runtime)/u.test(text)) selected.add('game-playtest');
  return EXPERIENCE_SKILLS.filter((skill) => selected.has(skill));
}

export function experienceSkillInstruction(input: { stage: StageName | string; request?: string }) {
  const skills = routeExperienceSkills(input);
  return skills.length ? `Apply these capability skills for this task: ${skills.join(', ')}. Keep model routing governed by the stage policy; skills add checks, not workspace permissions.` : 'No specialist product skill was selected; still require player-visible and natural-trigger evidence.';
}
