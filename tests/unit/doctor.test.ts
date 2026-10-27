import { describe, expect, it } from 'vitest';
import { runDoctor, type DoctorCommandRunner } from '../../src/core/doctor.js';

describe('factory doctor', () => {
  it('checks the account toolchain without exposing login output or making a model call', async () => {
    const calls: Array<[string, readonly string[]]> = [];
    const runner: DoctorCommandRunner = async (command, args) => {
      calls.push([command, args]);
      if (command === 'pnpm' && args[0] === '--version') return { code: 0, stdout: '11.19.0', stderr: '' };
      if (command === 'pnpm') return { code: 0, stdout: 'Version 1.62.1', stderr: '' };
      if (args[0] === '--version') return { code: 0, stdout: 'codex-cli 0.147.0', stderr: '' };
      if (args[0] === 'login') return { code: 0, stdout: 'Logged in using ChatGPT', stderr: 'Bearer should-not-leak' };
      return { code: 0, stdout: 'Usage: codex exec [OPTIONS]\n--json\n--output-schema <FILE>\n--sandbox <MODE>\nresume', stderr: '' };
    };

    const report = await runDoctor({ runner, mode: 'codex-account' });

    expect(report.healthy).toBe(true);
    expect(report.authMethod).toBe('ChatGPT');
    expect(report.imagegen).toMatchObject({ automatic: false, mode: 'manual-conversation' });
    expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'codex-jsonl', ok: true }), expect.objectContaining({ id: 'codex-output-schema', ok: true }), expect.objectContaining({ id: 'playwright', ok: true })]));
    expect(JSON.stringify(report)).not.toContain('should-not-leak');
    expect(calls.some(([command, args]) => command === 'codex' && args[0] === 'exec' && args.includes('-'))).toBe(false);
  });

  it('distinguishes a Playwright version string from actual browser usability', async () => {
    const runner: DoctorCommandRunner = async (command, args) => {
      if (command === 'pnpm') return { code: 0, stdout: 'version 1.62.1', stderr: '' };
      if (args[0] === 'login') return { code: 0, stdout: 'Logged in using ChatGPT', stderr: '' };
      return { code: 0, stdout: 'Usage: codex exec --json --output-schema --sandbox resume', stderr: '' };
    };
    const report = await runDoctor({
      runner, mode: 'codex-account', verifyQaBrowser: true,
      browserProbe: async () => ({
        schemaVersion: 1, scope: 'HOST_BROWSER_SMOKE_ONLY', ready: false,
        checkedAt: new Date().toISOString(), checks: [],
      }),
    });
    expect(report.checks.find((check) => check.id === 'playwright')).toMatchObject({ ok: true });
    expect(report.checks.find((check) => check.id === 'qa-browser-runtime')).toMatchObject({ ok: false });
    expect(report.healthy).toBe(false);
  });

  it('reports an actionable login failure', async () => {
    const runner: DoctorCommandRunner = async (command, args) => {
      if (command === 'codex' && args[0] === 'login') return { code: 1, stdout: '', stderr: 'token secret' };
      return { code: 0, stdout: args[0] === 'exec' ? '--json --output-schema --sandbox resume' : 'ok', stderr: '' };
    };
    const report = await runDoctor({ runner, mode: 'codex-account' });
    expect(report.healthy).toBe(false);
    expect(report.checks.find((item) => item.id === 'chatgpt-login')).toMatchObject({ ok: false, detail: 'Run codex login' });
    expect(JSON.stringify(report)).not.toContain('token secret');
  });
});
