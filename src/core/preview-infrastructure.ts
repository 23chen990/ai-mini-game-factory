import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { OpenSourceResearchSchema, TARGET_MINIGAME_PLATFORMS, type TemplateName } from '../schemas/index.js';
import { sha256Text } from './files.js';

const PackageSchema = z.object({ version: z.string(), license: z.literal('MIT') });
const Versions = z.record(z.string(), z.object({ version: z.string() }));
const LockSchema = z.object({ importers: z.object({ '.': z.object({ dependencies: Versions, devDependencies: Versions }) }) });

/** Bounded reuse review of infrastructure we actually execute, not an invented
 * "no external dependencies" finding. Platform certification stays separate. */
export async function researchPreviewInfrastructure(repositoryRoot: string, template: TemplateName) {
  const lockText = await readFile(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  const importer = LockSchema.parse(parse(lockText)).importers['.'];
  const versions = { ...importer.dependencies, ...importer.devDependencies };
  const templateManifest = z.object({ dependencies: z.record(z.string(), z.string()).optional() }).parse(JSON.parse(await readFile(path.join(repositoryRoot, 'templates/web-lite', template, 'package.json'), 'utf8')));
  const selected = ['vite', ...Object.keys(templateManifest.dependencies ?? {})];
  const repositories: Record<string, { url: string; licenseFile: string }> = {
    vite: { url: 'https://github.com/vitejs/vite', licenseFile: 'LICENSE' },
    phaser: { url: 'https://github.com/phaserjs/phaser', licenseFile: 'LICENSE.md' },
  };
  const observations = [`Inspected ${template}/package.json and factory lockfile sha256:${sha256Text(lockText)}.`, 'Factory-owned gameplay code is reused; no third-party game expression is selected.'];
  const candidates = await Promise.all(selected.map(async (name) => {
    const manifest = PackageSchema.parse(JSON.parse(await readFile(path.join(repositoryRoot, 'node_modules', name, 'package.json'), 'utf8')));
    const pinned = versions[name]!.version.split('(')[0];
    if (manifest.version !== pinned) throw new Error(`preview dependency ${name} differs from the frozen lockfile`);
    const license = await readFile(path.join(repositoryRoot, 'node_modules', name, 'LICENSE.md'), 'utf8');
    if (!license.includes('Permission is hereby granted') || !license.includes('copyright notice')) throw new Error(`preview dependency ${name} lacks the reviewed MIT grant`);
    observations.push(`${name}@${manifest.version}: package license evidence node_modules/${name}/LICENSE.md sha256:${sha256Text(license)}`);
    const repository = repositories[name]!;
    return { id: name, name, repositoryUrl: repository.url, revision: manifest.version, license: manifest.license,
      licenseEvidenceUrl: `${repository.url}/blob/v${manifest.version}/${repository.licenseFile}`,
      targetPlatforms: TARGET_MINIGAME_PLATFORMS,
      technicalFit: name === 'vite' ? 'Browser preview build tooling only; not a WeChat, Douyin or TapTap runtime/package adapter.' : 'Browser rendering infrastructure. WeChat, Douyin and TapTap each require their own adapter and real-device package QA; none is inferred from H5.',
      maintenanceRisk: 'unknown' as const, securityRisks: ['No current vulnerability or transitive-dependency audit is claimed by this scoped review.'],
      attributionRequirements: ['Preserve the bundled copyright and license notices when distributing applicable code. Review transitive notices before release.'], decision: 'REUSE' as const };
  }));
  return OpenSourceResearchSchema.parse({ schemaVersion: 1, observations, inferences: [],
    unknowns: ['Real platform compatibility and current dependency security require full-validation evidence.'],
    targetPlatforms: TARGET_MINIGAME_PLATFORMS, queries: ['Inspect the selected mother-template manifest, pinned lockfile, installed package versions and direct bundled license texts.'],
    candidates, outcome: 'REUSE_APPROVED', selectedCandidateIds: selected,
    rationale: 'Reuse only the inspected infrastructure for a local browser preview. This is not platform release or security approval.', researchedAt: new Date().toISOString() });
}
