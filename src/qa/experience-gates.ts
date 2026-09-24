import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { CompletionGateReportSchema, evaluateCompletionGates, type CandidateBinding, type CompletionGateReport } from '../core/completion-gates.js';
import { HumanPlaytestAcceptanceSchema } from '../schemas/factory-operating.js';

async function existingFiles(runRoot: string, files: string[]) {
  const found: string[] = [];
  for (const file of files) {
    try { await access(path.join(runRoot, file)); found.push(file); } catch { /* evidence is missing */ }
  }
  return found;
}

function pngHasVisibleVariation(bytes: Buffer) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.toString('ascii', offset, offset + 4); offset += 4;
    if (offset + length + 4 > bytes.length) return false;
    const data = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0; colorType = data[9] ?? 0;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || idat.length === 0) return false;
  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  let inflated: Buffer;
  try { inflated = inflateSync(Buffer.concat(idat)); } catch { return false; }
  if (inflated.length < (rowBytes + 1) * height) return false;
  const pixels = Buffer.alloc(rowBytes * height);
  const prior = Buffer.alloc(rowBytes);
  const paeth = (left: number, up: number, upLeft: number) => {
    const p = left + up - upLeft;
    const pa = Math.abs(p - left);
    const pb = Math.abs(p - up);
    const pc = Math.abs(p - upLeft);
    return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
  };
  for (let y = 0; y < height; y++) {
    const source = inflated.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1));
    const filter = inflated[y * (rowBytes + 1)] ?? 255;
    const row = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= channels ? row[x - channels]! : 0;
      const up = prior[x] ?? 0;
      const upLeft = x >= channels ? prior[x - channels]! : 0;
      const value = source[x] ?? 0;
      row[x] = filter === 0 ? value
        : filter === 1 ? (value + left) & 255
          : filter === 2 ? (value + up) & 255
              : filter === 3 ? (value + Math.floor((left + up) / 2)) & 255
              : filter === 4 ? (value + paeth(left, up, upLeft)) & 255
                : value;
    }
    row.copy(prior);
  }
  const first = pixels.subarray(0, channels);
  for (let i = channels; i < pixels.length; i += channels) {
    for (let channel = 0; channel < channels; channel++) {
      if (pixels[i + channel] !== first[channel]) return true;
    }
  }
  return false;
}

export async function runVisualEvidenceGate(runRoot: string, screenshots: string[]) {
  const evidence = await existingFiles(runRoot, screenshots);
  const readable = [];
  for (const file of evidence) {
    try {
      if (pngHasVisibleVariation(await readFile(path.join(runRoot, file)))) readable.push(file);
    } catch { /* retain only verified image evidence */ }
  }
  if (evidence.length < 2) return { passed: false, evidence: evidence.length ? evidence : ['screenshots:missing'] };
  if (readable.length < 2) return { passed: false, evidence: ['screenshots:blank-or-unreadable', ...evidence] };
  return { passed: true, evidence: readable };
}

export async function runLevelDifferenceGate(runRoot: string) {
  const file = path.join(runRoot, 'artifacts/level-difference.json');
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as { passed?: unknown };
    return { passed: value.passed === true, evidence: ['artifacts/level-difference.json'] };
  } catch { return { passed: false, evidence: ['artifacts/level-difference.json:missing'] }; }
}

export async function readHumanPlaytestGate(runRoot: string, expectedCandidateHash?: string) {
  const file = path.join(runRoot, 'human/playtest-acceptance.json');
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
    const parsed = HumanPlaytestAcceptanceSchema.safeParse(raw);
    const value = raw && typeof raw === 'object' ? raw as { passed?: unknown; buildHash?: unknown } : {};
    const evidence = ['human/playtest-acceptance.json'];
    if (!parsed.success && expectedCandidateHash) evidence.push('human/playtest-acceptance.json:invalid-or-legacy');
    const passed = value.passed === true && (expectedCandidateHash === undefined || (parsed.success && parsed.data.buildHash === expectedCandidateHash));
    if (expectedCandidateHash !== undefined && (!parsed.success || parsed.data.buildHash !== expectedCandidateHash)) evidence.push('human/playtest-acceptance.json:candidate-hash-mismatch');
    return { passed, evidence, parsed: parsed.success ? parsed.data : undefined };
  } catch { return { passed: false, evidence: ['human/playtest-acceptance.json:missing'], parsed: undefined }; }
}

export async function buildCompletionGateReport(input: { runRoot: string; corePassed: boolean; normalFlowPassed: boolean; screenshots: string[]; candidateHash?: string; requireCandidateBinding?: boolean }): Promise<CompletionGateReport> {
  if (input.requireCandidateBinding && input.candidateHash === undefined) {
    throw new Error('candidate binding requires candidateHash');
  }
  const human = await readHumanPlaytestGate(input.runRoot, input.candidateHash);
  const candidateBinding: CandidateBinding | undefined = input.candidateHash === undefined && !input.requireCandidateBinding
    ? undefined
    : {
      passed: input.candidateHash !== undefined && human.passed && human.parsed?.buildHash === input.candidateHash,
      evidence: human.evidence,
      blockers: input.candidateHash === undefined
        ? ['candidate-binding-missing']
        : human.passed && human.parsed?.buildHash === input.candidateHash ? [] : ['candidate-hash-mismatch'],
    };
  return CompletionGateReportSchema.parse(evaluateCompletionGates({
    core: { passed: input.corePassed, evidence: ['artifacts/build-report.json'] },
    normalFlow: { passed: input.normalFlowPassed, evidence: ['artifacts/qa-report.json'] },
    visualEvidence: await runVisualEvidenceGate(input.runRoot, input.screenshots),
    levelDifference: await runLevelDifferenceGate(input.runRoot),
    humanPlaytest: { passed: human.passed, evidence: human.evidence },
  }, {
    ...(input.candidateHash ? { candidateHash: input.candidateHash } : {}),
    ...(candidateBinding ? { candidateBinding } : {}),
  }));
}
