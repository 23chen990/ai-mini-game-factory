import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { ExperienceComplaintTriageSchema, ExperienceReproductionMatrixSchema } from '../../../src/schemas/experience-complaint.ts';

const root = process.cwd();
const dir = path.join(root, 'docs/lean-pilot/racing-internal-20261020');
const workspace = path.join(root, 'runs/h5-qq-mobile-20261013/workspace');
const old = 'docs/lean-pilot/racing-final-20261020/';
const evidence = async (file: string) => ({
  path: file, sha256: createHash('sha256').update(await readFile(file)).digest('hex'),
  kind: 'qa-artifact' as const, provenance: 'verified-run-artifact' as const,
});
const ai = await evidence(old + 'evidence/natural-summary.json');
const gallery = await evidence(old + 'evidence/browser-gallery.json');
const observed = [
  'Attempt 16 visible-pixel/touch driver won stages 01–12 with 8–32 crashes per race and no effective drift, spray or nitro. This is not a human win-rate estimate.',
  'Removing predictive braking in the read-only experiment improved stage 01 from 128.000 to 119.575 s, but increased aggregate wall crashes from 5 to 525: rejected, not a fix.',
  'Six actual car previews exist. Custom-01 at 844×390 has busy high-contrast purple/black surfaces and the faceted green vegetation conflicts with the hard-surface car.',
  'Trusted touch countersteer passed the starter/844×390 branch; resource use, small viewport natural driving, later stages and physical devices remain separate evidence gaps.',
];
await mkdir(dir, { recursive: true });
const triage = ExperienceComplaintTriageSchema.parse({
  schemaVersion: 1, artifactType: 'experience-complaint-triage',
  targetGame: 'qq-speed / 极速飞驰', workspace,
  report: 'Continue internal experience repairs; account blockers are separate. Do not call missing or failed natural/perceptual evidence problem-free.',
  classification: ['core-experience', 'visual-hierarchy', 'mobile-readability', 'failure-attribution'],
  scope: { route: 'formal-fixer', rationale: 'Existing validated core-loop and perceptual QA failures require retained QA → Fixer → natural/perceptual retest. No new factory stage or gate.',
    generatedWorkspaceModified: false, contextIntentionallyOmitted: ['Other games', 'Account provisioning', 'Historical branches already audited', 'Unverified reference media'] },
  reproduction: { status: 'REPRODUCED', steps: ['Read exact attempt 16 evidence', 'Recheck remote HEAD 05e31aa698b3625a7efdc16490cdf05bf69c6351', 'Compare isolated controller hypotheses on unchanged native physics before implementing'],
    observed, evidence: [ai, gallery] },
  acceptanceCriteria: [
    'No changes to native player physics, speed, position, progress, rank, clocks, finish rules or catch-up based on player lead.',
    'All 150 fixed-seed native opponents finish all 30 unchanged routes within the existing 350 s limit; legal shortcut entries/exits remain balanced.',
    'Retain an AI change only with a material pace improvement over attempt 16 on early routes, no existing podium pace regression beyond the existing 1 s budget, and no wall-riding or sustained collision-convoy strategy.',
    'Run the same visible-pixel normal-input player policy against the new build, record rank changes, rival gaps and overtakes; a no-resource crash-heavy easy win is not sufficient competition.',
    'Natural successful drift release → small spray, earned nitro and item use are independently observable; repeat countersteer, pause and rotate at both 844×390 and 667×375 without overlapping controls.',
    'Review all six exact models at three landscape viewports; reduce the observed presentation defect without replacing licensed/user assets blindly, hiding it in particles or falsely animating merged wheels.',
    'Natural wins, losses, retry, next-stage and saved progress must use normal inputs; preserve every failed run and exact build hash. Hardware and human subjective findings remain honest, never inferred from automation.',
  ],
  status: 'READY_FOR_REPAIR', createdAt: new Date().toISOString(),
});
await writeFile(dir + '/triage.json', JSON.stringify(triage, null, 2) + '\n');
const viewports = [{ label: 'desktop', width: 1366, height: 768 }, { label: 'touch', width: 844, height: 390 }, { label: 'small-touch', width: 667, height: 375 }];
const objects = ['starter', 'custom-01', 'custom-02', 'custom-03', 'custom-04', 'custom-05'];
const matrix = ExperienceReproductionMatrixSchema.parse({
  schemaVersion: 1, artifactType: 'experience-reproduction-matrix', targetGame: triage.targetGame, workspace,
  axes: { objectTypes: [...objects, 'physical-ai', 'wheel-resources'], lifecycleStateBranches: ['home', 'race', 'settlement-replay'], rendererPaths: ['default Three.js + DOM'], viewports },
  cells: [
    ...objects.flatMap(objectType => viewports.map(viewport => ({
      id: `${objectType}-home-${viewport.label}`, objectType, lifecycleStateBranch: 'home',
      rendererPath: 'default Three.js + DOM', viewport, status: 'BLOCKED',
      expected: 'Exact car readable, correctly framed and unobscured; material and environment cohesion reviewed from actual pixels.',
      observed: 'Prior actual image available, new candidate not yet built or reviewed.', evidence: [gallery],
    }))),
    ...['physical-ai', 'wheel-resources'].flatMap(objectType => viewports.slice(1).map(viewport => ({
      id: `${objectType}-race-${viewport.label}`, objectType, lifecycleStateBranch: 'race',
      rendererPath: 'default Three.js + DOM', viewport, status: objectType === 'physical-ai' ? 'REPRODUCED' : 'BLOCKED',
      expected: 'Physical, understandable competition and distinct successful natural resource inputs with recovery.',
      observed: observed[objectType === 'physical-ai' ? 0 : 3], evidence: [ai],
    }))),
  ], confirmedFindings: observed, remainingGaps: ['Fresh final-build perceptual and natural retest', 'Actual Android/iPhone and human usability'], createdAt: new Date().toISOString(),
});
await writeFile(dir + '/reproduction-matrix.json', JSON.stringify(matrix, null, 2) + '\n');
const task = z.object({
  schemaVersion: z.literal(1), task: z.string(), root: z.string(), workspace: z.string(),
  route: z.literal('formal-fixer'), ownership: z.string(), inputEvidence: z.array(z.string()),
  questions: z.array(z.string()).length(4), instructions: z.array(z.string()), acceptance: z.array(z.string()), output: z.string(),
}).parse({
  schemaVersion: 1, task: 'visual-diagnosis', root, workspace, route: 'formal-fixer',
  ownership: 'Read-only visual/source diagnosis; write ONLY the output JSON in the docs folder. No workspace/template changes or builds.',
  inputEvidence: [dir + '/triage.json', dir + '/reproduction-matrix.json', root + '/runs/h5-qq-mobile-20261013/artifacts/final-20261020/browser/gallery.json'],
  questions: [
    'Observed failure: attempt 16 six-car gallery has incoherent shiny/baked imported cars and faceted scenery; inspect exact screenshots to refine, not an imagined design risk.',
    'Causal alternatives: distinguish baked texture/model geometry from material/lighting/camera/environment using current loader and actual pixels; no image-derived Figma measurements.',
    'Simpler alternative: keep working camera/layout; propose smallest existing-module correction before remodel/new asset pipeline. Read-only isolated review avoids simultaneous source writes and repeated context.',
    'Experiment: before/after exact six models and 1366×768/844×390/667×375, full pixel ratio. Retain only visible improvement without hiding detail, clipping, UI overlap or performance regression. Limit review to one pass and no new architecture.',
  ],
  instructions: [
    'You are not alone in the codebase. Do not revert others or edit source, tests, generated game or old evidence.',
    'Read the named target screenshots with view_image and source implementing their exact branch.',
    'Return evidence-backed concrete low-cost patches with file/function locations; separate observation, hypothesis and unknown. Do not declare player perception pass.',
    'All agent exchange is this Zod-validated structured artifact. Write output and validate via Zod before returning JSON only with its absolute path and SHA-256.',
  ],
  acceptance: ['All six car branches inspected at least at touch size', 'Exact causes distinguished or unknown', 'No file changes except output JSON', 'Output validated using Zod object {schemaVersion: literal(1), task: string, findings: array({id:string,severity:enum(P0,P1,P2,INFO),observation:string,evidence:array(string),recommendation:string}), blockers:array(string), commands:array(string)}'],
  output: dir + '/visual-diagnosis.json',
});
await writeFile(dir + '/visual-task.json', JSON.stringify(task, null, 2) + '\n');
console.log('Triage, matrix and bounded read-only task validated.');
