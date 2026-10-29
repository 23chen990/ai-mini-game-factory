#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ReferenceCaptureActionListSchema } from '../schemas/reference-web-capture.js';
import { createFactory } from '../factory.js';
import { runDoctor } from '../core/doctor.js';
import { runQaBrowserPreflight, assertQaBrowserPreflight } from '../qa/browser-preflight.js';
import { StageNameSchema } from '../schemas/index.js';

const [command, ...args] = process.argv.slice(2); const repositoryRoot = process.cwd(); const factory = createFactory({ repositoryRoot, root: process.env.FACTORY_ROOT ? path.resolve(process.env.FACTORY_ROOT) : repositoryRoot });
function requireArg(value: string | undefined, name: string): string { if (!value) throw new Error(`Missing ${name}`); return value; }
function option(name: string) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
async function main() {
  if (command === 'doctor') { const report = await runDoctor({ verifyQaBrowser: args.includes('--qa') ? true : undefined }); console.log(JSON.stringify(report, null, 2)); if (!report.healthy) process.exitCode = 1; return; }
  if (command === 'qa-preflight') {
    const report = await runQaBrowserPreflight();
    console.log(JSON.stringify(report, null, 2));
    try { assertQaBrowserPreflight(report); } catch { process.exitCode = 2; }
    return;
  }
  switch (command) {
    case 'route': console.log(JSON.stringify(factory.routeRequest({ request: requireArg(args[0], 'request'), targetRunId: option('--run') }), null, 2)); break;
    case 'eval': { const results = args.includes('--agent-results') ? requireArg(option('--agent-results'), '--agent-results file') : undefined; console.log(JSON.stringify(await factory.persistFactoryEval(results === undefined ? {} : { agentResultsPath: path.resolve(results) }), null, 2)); break; }
    case 'feedback': console.log(JSON.stringify(await factory.recordFeedback(requireArg(args[0], 'run-id'), requireArg(args[1], 'feedback')), null, 2)); break;
    case 'feedback-structured': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'feedback-json')), 'utf8')); console.log(JSON.stringify(await factory.recordStructuredFeedback(runId, value), null, 2)); break; }
    case 'operating-status': console.log(JSON.stringify(await factory.operatingStatus(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'set-portfolio':
    case 'record-portfolio': { const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[0], 'portfolio-json')), 'utf8')); console.log(JSON.stringify(await factory.recordAccountPortfolio(value), null, 2)); break; }
    case 'set-portfolio-strategy':
    case 'record-portfolio-strategy': { const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[0], 'portfolio-strategy-json')), 'utf8')); console.log(JSON.stringify(await factory.recordPortfolioStrategy(value, { force: args.includes('--force') }), null, 2)); break; }
    case 'record-platform-policy': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'platform-policy-json')), 'utf8')); console.log(JSON.stringify(await factory.recordPlatformPolicy(runId, value), null, 2)); break; }
    case 'record-side-effect': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'side-effect-command-json')), 'utf8')); console.log(JSON.stringify(await factory.recordSideEffect(runId, value), null, 2)); break; }
    case 'record-cost': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'cost-adjustment-json')), 'utf8')); console.log(JSON.stringify(await factory.recordCostAdjustment(runId, value), null, 2)); break; }
    case 'authorize-cost-continuation': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'authorization-json')), 'utf8')); console.log(JSON.stringify(await factory.authorizeCostContinuation(runId, value), null, 2)); break; }
    case 'record-certification': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'certification-json')), 'utf8')); console.log(JSON.stringify(await factory.recordCertification(runId, value), null, 2)); break; }
    case 'record-launch-metrics': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'launch-metrics-json')), 'utf8')); console.log(JSON.stringify(await factory.recordLaunchMetrics(runId, value), null, 2)); break; }
    case 'live-verify': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'live-verification-json')), 'utf8')); console.log(JSON.stringify(await factory.recordLiveVerification(runId, value), null, 2)); break; }
    case 'approve-business': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'preflight-json')), 'utf8')); console.log(JSON.stringify(await factory.approveBusinessPreflight(runId, value, { force: args.includes('--force') }), null, 2)); break; }
    case 'platform-qa': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'platform-qa-json')), 'utf8')); console.log(JSON.stringify(await factory.submitPlatformQa(runId, value), null, 2)); break; }
    case 'approve-playtest': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'playtest-json')), 'utf8')); console.log(JSON.stringify(await factory.approveHumanPlaytest(runId, value, { force: args.includes('--force') }), null, 2)); break; }
    case 'approve-human': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'approval-json')), 'utf8')); console.log(JSON.stringify(await factory.recordHumanApproval(runId, value), null, 2)); break; }
    case 'record-variation': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'variation-json')), 'utf8')); console.log(JSON.stringify(await factory.recordContentVariation(runId, value), null, 2)); break; }
    case 'record-baseline': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'baseline-json')), 'utf8')); console.log(JSON.stringify(await factory.recordQualityBaseline(runId, value), null, 2)); break; }
    case 'record-originality': { const runId = requireArg(args[0], 'run-id'); const value = JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(requireArg(args[1], 'originality-json')), 'utf8')); console.log(JSON.stringify(await factory.recordOriginality(runId, value), null, 2)); break; }
    case 'plan': { const runId = requireArg(args[0], 'run-id'); console.log(JSON.stringify(await factory.pipelinePlan(runId), null, 2)); break; }
    case 'validate': { const seed = await factory.validate(path.resolve(requireArg(args[0], 'seed-file'))); console.log(JSON.stringify({ valid: true, seed }, null, 2)); break; }
    case 'new': { const runId = await factory.newRun(path.resolve(requireArg(args[0], 'seed-file'))); console.log(runId); break; }
    case 'new-reference': console.log(await factory.newReference(path.resolve(requireArg(args[0], 'reference-brief.json')))); break;
    case 'new-action': { const runId = await factory.newActionExperiment(path.resolve(requireArg(args[0], 'action-experiment-file'))); console.log(runId); break; }
    case 'run': console.log(JSON.stringify(await factory.run(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'status': console.log(JSON.stringify(await factory.status(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'readiness': console.log(JSON.stringify(await factory.readiness(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'capture-reference-url': {
      const actionsFile = option('--actions');
      const allowedHosts = option('--allowed-hosts');
      const result = await factory.captureReferenceUrl(requireArg(args[0], 'run-id'), {
        url: requireArg(option('--url'), '--url'), captureId: requireArg(option('--capture-id'), '--capture-id'),
        ...(allowedHosts ? { allowedHosts: allowedHosts.split(',') } : {}),
        ...(option('--seconds') ? { durationSeconds: Number(option('--seconds')) } : {}),
        ...(option('--fps') ? { fps: Number(option('--fps')) } : {}),
        ...(actionsFile ? { actions: ReferenceCaptureActionListSchema.parse(JSON.parse(await readFile(path.resolve(actionsFile), 'utf8'))) } : {}),
      });
      console.log(JSON.stringify(result, null, 2));
      if (result.capture.status === 'BLOCKED') process.exitCode = 2;
      break;
    }
    case 'promote-reference-capture': console.log(JSON.stringify(await factory.promoteReferenceCapture(requireArg(args[0], 'run-id'), requireArg(option('--capture-id'), '--capture-id')), null, 2)); break;
    case 'discard-reference-capture': console.log(JSON.stringify(await factory.discardReferenceCapture(requireArg(args[0], 'run-id'), requireArg(option('--capture-id'), '--capture-id')), null, 2)); break;
    case 'audit-reference': console.log(JSON.stringify(await factory.auditReference(requireArg(args[0], 'run-id'), { targetGame: option('--target-game'), targetWorkspace: option('--workspace') }), null, 2)); break;
    case 'extract-reference-frames': console.log(JSON.stringify(await factory.extractReferenceFrames(requireArg(args[0], 'run-id'), { evidenceId: option('--evidence-id'), ...(option('--fps') ? { fps: Number(option('--fps')) } : {}), ...(option('--max-frames') ? { maxFrames: Number(option('--max-frames')) } : {}) }), null, 2)); break;
    case 'recover-reference-research': console.log(JSON.stringify(await factory.recoverReferenceResearch(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'reproject-reference': console.log(JSON.stringify(await factory.recoverReferenceResearch(requireArg(args[0], 'run-id'), { reprojectCompleted: true }), null, 2)); break;
    case 'resume': console.log(JSON.stringify(await factory.resume(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'approve-prototype': { const runId = requireArg(args[0], 'run-id'); const result = await factory.approvePrototype(runId, { decision: requireArg(option('--decision'), '--decision'), notes: option('--notes') ?? '', force: args.includes('--force') }); console.log(`Prototype decision saved: ${result.file}\nNext: ${result.nextCommand}`); break; }
    case 'approve-reference': { const runId = requireArg(args[0], 'run-id'); const result = await factory.approveReference(runId, { decision: requireArg(option('--decision'), '--decision'), notes: option('--notes') ?? '', force: args.includes('--force') }); console.log(`Reference mechanic decision saved: ${result.file}\nNext: ${result.nextCommand}`); break; }
    case 'approve-action': { const runId = requireArg(args[0], 'run-id'); const result = await factory.approveActionExperiment(runId, { decision: requireArg(option('--decision'), '--decision'), selectedSlot: option('--slot') ?? null, rationale: requireArg(option('--rationale'), '--rationale'), requiredChanges: (option('--changes') ?? '').split('|').map((value) => value.trim()).filter(Boolean), force: args.includes('--force') }); console.log(`Action decision saved: ${result.file}\nNext: ${result.nextCommand}`); break; }
    case 'implement-formal': console.log(JSON.stringify(await factory.implementFormalPrototype(path.resolve(requireArg(args[0], 'constraints-file'))), null, 2)); break;
    case 'preview': { const preview = await factory.previewPrototype(requireArg(args[0], 'run-id'), requireArg(args[1], 'prototype')); console.log(preview.url); await new Promise<void>((resolve) => { const stop = () => { void preview.stop().finally(resolve); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); }); break; }
    case 'verify-build': console.log(JSON.stringify(await factory.verifyBuild(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'approve': { const runId = requireArg(args[0], 'run-id'); const result = await factory.approve(runId, { direction: requireArg(option('--direction'), '--direction'), notes: option('--notes') ?? '', force: args.includes('--force') }); console.log(`Approval saved: ${result.file}\nNext: ${result.nextCommand}`); break; }
    case 'retry': console.log(JSON.stringify(await factory.retry(requireArg(args[0], 'run-id'), StageNameSchema.parse(requireArg(args[1], 'stage').toUpperCase())), null, 2)); break;
    case 'inspect': console.log(JSON.stringify(await factory.inspect(requireArg(args[0], 'run-id')), null, 2)); break;
    case 'demo-reference': {
      const { prepareReferenceDemo, runReferenceDemo } = await import('../demo/reference-demo.js');
      const location = { repositoryRoot, root: process.env.FACTORY_ROOT ? path.resolve(process.env.FACTORY_ROOT) : repositoryRoot };
      if (args.includes('--prepare')) console.log(JSON.stringify(await prepareReferenceDemo(location), null, 2));
      else {
        const report = await runReferenceDemo({ ...location, runId: requireArg(args[0], 'fixture-run-id (create with --prepare)') });
        console.log(JSON.stringify(report, null, 2));
        if (!report.engineeringPassed || !report.stableResume) process.exitCode = 2;
      }
      break;
    }
    case 'demo': { const runId = await factory.demo(args[0] ? path.resolve(args[0]) : undefined); console.log(JSON.stringify({ runId, state: await factory.status(runId) }, null, 2)); break; }
    default: throw new Error('Usage: factory <doctor|route|eval|feedback|feedback-structured|operating-status|set-portfolio|record-portfolio|set-portfolio-strategy|record-portfolio-strategy|record-platform-policy|record-side-effect|record-cost|authorize-cost-continuation|record-certification|record-launch-metrics|live-verify|approve-business|platform-qa|approve-playtest|approve-human|record-variation|record-baseline|record-originality|plan|validate|new|new-reference|new-action|run|status|readiness|capture-reference-url|promote-reference-capture|discard-reference-capture|audit-reference|extract-reference-frames|recover-reference-research|reproject-reference|resume|approve-reference|approve-prototype|approve-action|implement-formal|preview|approve|verify-build|retry|inspect|demo|demo-reference> [...args]');
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
