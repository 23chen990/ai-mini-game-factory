/** Synthetic artifact plumbing only; never real research or player evidence. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Text } from '../../src/core/files.js';
import type { ReferenceBehaviorCheck, ReferenceFidelityContract } from '../../src/schemas/reference-fidelity.js';
import { ReferenceComparisonCaptureSchema } from '../../src/schemas/reference-comparison.js';

export function syntheticComparisonChecks(checks: ReferenceBehaviorCheck[]) {
  return checks.map((check) => ({ ...check, comparison: {
    evidenceBasis: 'runtime-observed' as const, referenceArtifact: {path:check.sourceRefs[0]!.path,sha256:check.sourceRefs[0]!.sha256},
    condition: 'synthetic ready state', protocol: 'synthetic tap then retry', metric: 'synthetic rule violations', unit: 'count',
    referenceRange: {min:0,max:0}, maxDelta:0, minimumSamples:1,
  }}));
}

export async function writeSyntheticComparison(runRoot: string, contract: ReferenceFidelityContract, buildHash: string, screenshot: {path:string;sha256:string}) {
  await mkdir(path.join(runRoot,'logs'),{recursive:true});
  const write = async (target:'reference'|'candidate') => {
    const capture=ReferenceComparisonCaptureSchema.parse({schemaVersion:1,targetRunId:contract.targetRunId,contractHash:sha256Text(JSON.stringify(contract)),target,
      artifactHash:target==='reference'?contract.provenance[0]!.sha256:buildHash,authority:'normal-input',startedFromReset:true,forbiddenOperations:[],
      actions:['synthetic tap','synthetic retry'],observedAt:new Date(0).toISOString(),durationMs:180_000,
      observations:contract.behaviorChecks.map(check=>({checkId:check.id,objectType:check.objectType,stateBranch:check.stateBranch,viewport:check.viewport,
        condition:check.comparison!.condition,protocol:check.comparison!.protocol,metric:check.comparison!.metric,unit:check.comparison!.unit,samples:[0],screenshots:[screenshot]}))});
    const body=JSON.stringify(capture); const file={path:`logs/synthetic-${target}.json`,sha256:sha256Text(body)};
    await writeFile(path.join(runRoot,file.path),body); return file;
  };
  return {reference:await write('reference'),candidate:await write('candidate')};
}
