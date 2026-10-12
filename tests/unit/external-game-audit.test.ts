import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditExistingGame } from '../../src/core/external-game-audit.js';
import { QUALITY_DIMENSIONS } from '../../src/schemas/quality-gates.js';

const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const built = '<html><body>browser build</body></html>';
  const required = ['engineering', 'natural-input', 'perceptual', 'human-playtest', 'phone-performance', 'platform-package'];
  const filename = (kind: string) => kind === 'perceptual' ? 'scene.png' : kind === 'natural-input' ? 'journey.json' : kind === 'phone-performance' ? 'phone.csv' : 'proof.json';
  const content = (kind: string) => kind === 'perceptual' ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from(`proof for ${kind}`);
  const cases = QUALITY_DIMENSIONS.map((dimension, i) => ({ id: `case-${i}`, dimension, objectType: 'patrol',
    stateBranch: 'playing', rendererPath: 'src/main.ts', viewport: { width: 844, height: 390, label: 'phone-landscape' },
    expected: 'Player can observe and control the declared scenario', naturalTrigger: 'press and release',
    requiredEvidenceKinds: [required[i % required.length]] }));
  const evidence = cases.map((row, i) => { const kind = required[i % required.length]!; return { caseId: row.id,
    kind, buildHash: hash(built), status: 'PASS', reviewer: kind === 'human-playtest' ? 'real-player-A' : 'independent-QA',
    independentOfBuilder: true, observed: 'Verified natural visible behavior',
    inputMethod: ({engineering:'fixture','natural-input':'natural-input',perceptual:'independent-visual','human-playtest':'human','phone-performance':'real-device','platform-package':'platform-toolchain'} as Record<string,string>)[kind],
    files: [{path:`evidence/${row.id}/${filename(kind)}`,sha256:hash(content(kind))}] };
  });
  return { built, cases, evidence, content, filename };
}

type AuditFixtureManifest = {
  schemaVersion: number; targetGame: string; repository: string; commit: string;
  workspace: string; scope: string; playable: { path: string; sha256: string };
  cases: ReturnType<typeof fixture>['cases'];
  evidence: ReturnType<typeof fixture>['evidence'];
  requireHumanPlaytest: boolean;
};
async function isolated(testBody: (args: {root:string;manifestPath:string;manifest:AuditFixtureManifest})=>Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'external-qa-'));
  try {
    const {built,cases,evidence,content,filename}=fixture();
    await writeFile(path.join(root,'index.html'),built);
    for(const [i,row] of cases.entries()) { const kind=evidence[i]!.kind; await mkdir(path.join(root,'evidence',row.id),{recursive:true});
      await writeFile(path.join(root,'evidence',row.id,filename(kind)),content(kind)); }
    const manifest: AuditFixtureManifest = {schemaVersion:1,targetGame:'night-market-hero',repository:'23chen990/night-market-hero',
      commit:'a'.repeat(40),workspace:root,scope:'web-lite',playable:{path:'index.html',sha256:hash(built)},
      cases,evidence,requireHumanPlaytest:true};
    const manifestPath=path.join(root,'manifest.json');
    await testBody({root,manifestPath,manifest});
  } finally { await rm(root,{recursive:true,force:true}); }
}

describe('external game evidence verifier',()=>{
  test('can verify a complete, correctly-bound independent evidence matrix without writing to the game',async()=>isolated(async({manifestPath,manifest})=>{
    await writeFile(manifestPath,JSON.stringify(manifest));
    const report=await auditExistingGame(manifestPath);
    expect(report.passed).toBe(true);
    expect(report.quality.dimensions).toHaveLength(7);
    expect(report.cases.every(c=>c.status==='PASS')).toBe(true);
  }));
  test('missing a single viewport case cannot inherit a sibling dimension pass',async()=>isolated(async({manifestPath,manifest})=>{
    manifest.cases[0]!.requiredEvidenceKinds.push('natural-input');
    await writeFile(manifestPath,JSON.stringify(manifest));
    const report=await auditExistingGame(manifestPath);
    expect(report.passed).toBe(false);
    expect(report.cases[0]!.blockers).toContain('required-evidence-count:natural-input:0');
  }));
  test('different build hashes invalidate natural player evidence',async()=>isolated(async({manifestPath,manifest})=>{
    manifest.evidence[1]!.buildHash='f'.repeat(64);
    await writeFile(manifestPath,JSON.stringify(manifest));
    const report=await auditExistingGame(manifestPath);
    expect(report.passed).toBe(false);
    expect(report.cases[1]!.blockers).toContain('natural-input:wrong-build-hash');
  }));
  test('a builder cannot sign an independent visual success',async()=>isolated(async({manifestPath,manifest})=>{
    manifest.evidence[2]!.independentOfBuilder=false;
    await writeFile(manifestPath,JSON.stringify(manifest));
    const report=await auditExistingGame(manifestPath);
    expect(report.passed).toBe(false);
    expect(report.cases[2]!.blockers).toContain('perceptual:reviewer-not-independent');
  }));
  test('path traversal, forged bytes and symlinks fail closed',async()=>isolated(async({root,manifestPath,manifest})=>{
    manifest.evidence[0]!.files[0]!.path='../not-a-proof.json';
    await writeFile(manifestPath,JSON.stringify(manifest));
    expect((await auditExistingGame(manifestPath)).passed).toBe(false);
    manifest.evidence[0]!.files[0]!.path='evidence/case-0/proof.json';
    manifest.evidence[0]!.files[0]!.sha256='1'.repeat(64);
    await writeFile(manifestPath,JSON.stringify(manifest));
    expect((await auditExistingGame(manifestPath)).passed).toBe(false);
    await rm(path.join(root,'evidence/case-0/proof.json'));
    await symlink(path.join(root,'index.html'),path.join(root,'evidence/case-0/proof.json'));
    await writeFile(manifestPath,JSON.stringify(manifest));
    expect((await auditExistingGame(manifestPath)).passed).toBe(false);
  }));
  test('missing independent human acceptance remains a blocking gap',async()=>isolated(async({manifestPath,manifest})=>{
    manifest.evidence = manifest.evidence.filter(row=>row.kind!=='human-playtest');
    await writeFile(manifestPath,JSON.stringify(manifest));
    const report=await auditExistingGame(manifestPath);
    expect(report.blockers).toContain('independent-human-playtest-missing');
  }));
});