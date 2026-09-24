import { spawn } from 'node:child_process';
import { probeCodexImagegen, type CodexImagegenCapability } from '../providers/codex-imagegen.js';

type CommandResult = { code: number | null; stdout: string; stderr: string };
export type DoctorCommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;
export type DoctorCheck = { id: string; ok: boolean; detail: string };
export type DoctorReport = { healthy: boolean; mode: string; authMethod: 'ChatGPT' | 'none'; checks: DoctorCheck[]; imagegen: CodexImagegenCapability };

const defaultRunner: DoctorCommandRunner = (command, args) => new Promise((resolve) => {
  const child = spawn(command, [...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.on('error', () => resolve({ code: null, stdout: '', stderr: '' }));
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

export async function runDoctor(options: { runner?: DoctorCommandRunner; mode?: string } = {}): Promise<DoctorReport> {
  const runner = options.runner ?? defaultRunner;
  const mode = options.mode ?? process.env.FACTORY_MODE ?? 'mock';
  const [pnpm, codexVersion, login, execHelp, playwright] = await Promise.all([
    runner('pnpm', ['--version']),
    runner('codex', ['--version']),
    runner('codex', ['login', 'status']),
    runner('codex', ['exec', '--help']),
    runner('pnpm', ['exec', 'playwright', '--version']),
  ]);
  const help = execHelp.stdout;
  const chatGpt = login.code === 0 && `${login.stdout}\n${login.stderr}`.includes('Logged in using ChatGPT');
  const imagegen = codexVersion.code === 0 ? probeCodexImagegen(help) : probeCodexImagegen('');
  const checks: DoctorCheck[] = [
    { id: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20, detail: process.version },
    { id: 'pnpm', ok: pnpm.code === 0, detail: pnpm.code === 0 ? pnpm.stdout.trim() : 'pnpm is unavailable' },
    { id: 'codex-cli', ok: codexVersion.code === 0, detail: codexVersion.code === 0 ? codexVersion.stdout.trim() : 'Install Codex CLI' },
    { id: 'chatgpt-login', ok: chatGpt, detail: chatGpt ? 'Logged in using ChatGPT' : 'Run codex login' },
    { id: 'codex-exec', ok: execHelp.code === 0 && help.includes('Usage:'), detail: execHelp.code === 0 ? 'codex exec is available' : 'codex exec is unavailable' },
    { id: 'codex-jsonl', ok: help.includes('--json'), detail: help.includes('--json') ? '--json supported' : '--json missing' },
    { id: 'codex-output-schema', ok: help.includes('--output-schema'), detail: help.includes('--output-schema') ? '--output-schema supported' : '--output-schema missing' },
    { id: 'codex-resume', ok: help.includes('resume'), detail: help.includes('resume') ? 'resume supported' : 'resume missing' },
    { id: 'workspace-write', ok: help.includes('--sandbox'), detail: help.includes('--sandbox') ? 'workspace-write selectable' : '--sandbox missing' },
    { id: 'playwright', ok: playwright.code === 0, detail: playwright.code === 0 ? playwright.stdout.trim() : 'Playwright is unavailable' },
    { id: 'imagegen', ok: imagegen.available, detail: `${imagegen.mode}: ${imagegen.reason}` },
    { id: 'factory-mode', ok: ['mock', 'live-art', 'codex-account'].includes(mode), detail: mode },
  ];
  return { healthy: checks.every((check) => check.ok), mode, authMethod: chatGpt ? 'ChatGPT' : 'none', checks, imagegen };
}
