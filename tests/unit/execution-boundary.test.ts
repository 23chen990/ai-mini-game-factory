import { describe, expect, it } from 'vitest';
import { assertExecutionContext, ExecutionBoundaryError } from '../../src/core/execution-boundary.js';

const base = {
  runRoot: '/tmp/factory/runs/run-1',
  outputPath: '/tmp/factory/runs/run-1/artifacts/result.json',
  logDir: '/tmp/factory/runs/run-1/logs',
  inputPaths: ['artifacts/input.json'],
  stage: 'COMPETITOR_RESEARCH',
  model: 'gpt-test',
  reasoning: 'high' as const,
  sandbox: 'read-only' as const,
};

describe('execution boundary', () => {
  it('accepts a read-only research context inside the run', () => {
    expect(assertExecutionContext(base)).toMatchObject({ role: 'research', sandbox: 'read-only' });
  });

  it('rejects a research context that can mutate the workspace', () => {
    expect(() => assertExecutionContext({ ...base, sandbox: 'workspace-write' })).toThrow(ExecutionBoundaryError);
  });

  it('rejects output and input paths that escape the run root', () => {
    expect(() => assertExecutionContext({ ...base, outputPath: '/tmp/factory/secret.json' })).toThrow(/run root/i);
    expect(() => assertExecutionContext({ ...base, inputPaths: ['../secret.json'] })).toThrow(/path/i);
  });

  it('only permits Builder/Fixer roles to target a generated workspace', () => {
    expect(() => assertExecutionContext({ ...base, stage: 'FULL_BUILD', sandbox: 'read-only' })).toThrow(/workspace-write/i);
    expect(assertExecutionContext({ ...base, stage: 'FULL_BUILD', sandbox: 'workspace-write', outputPath: '/tmp/factory/runs/run-1/workspace/game/build.log' })).toMatchObject({ role: 'builder' });
  });

  it('keeps release and producer outputs outside the generated game workspace', () => {
    expect(assertExecutionContext({ ...base, stage: 'RELEASE', outputPath: '/tmp/factory/runs/run-1/artifacts/release-manifest.json' })).toMatchObject({ role: 'release' });
    expect(() => assertExecutionContext({ ...base, stage: 'RELEASE', outputPath: '/tmp/factory/runs/run-1/workspace/game/release.json' })).toThrow(/workspace|release/i);
    expect(() => assertExecutionContext({ ...base, stage: 'BLUEPRINT', outputPath: '/tmp/factory/runs/run-1/workspace/game/blueprint.json' })).toThrow(/workspace|producer/i);
  });

  it('allows only hash-bound derived reference images as research media inputs', () => {
    const sha256 = 'a'.repeat(64);
    expect(assertExecutionContext({ ...base, stage: 'REFERENCE_DEEP_RESEARCH', mediaInputs: [{ path: 'reference-evidence/derived/recording/frame.png', sha256 }] })).toMatchObject({ mediaInputs: [{ sha256 }] });
    expect(() => assertExecutionContext({ ...base, stage: 'REFERENCE_DEEP_RESEARCH', mediaInputs: [{ path: 'workspace/game/frame.png', sha256 }] })).toThrow(/derived reference evidence/i);
    expect(() => assertExecutionContext({ ...base, stage: 'REFERENCE_DEEP_RESEARCH', mediaInputs: [{ path: 'reference-evidence/derived/recording/frame.png', sha256: 'bad' }] })).toThrow(/sha-256/i);
  });
});
