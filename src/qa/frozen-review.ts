import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { exists, sha256File } from '../core/files.js';
const exec = promisify(execFile);

/** Frozen review needs no tools: pixels are attached and the normal-input
 * timeline is in the prompt. In particular native view_image is not a shell
 * subprocess, so a shell-only sandbox would not constrain it. */
export function frozenQaToolArgs(): string[] {
  return ['--ignore-rules', '--ephemeral', '--skip-git-repo-check',
    '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0', '-c', 'web_search="disabled"',
    ...['shell_tool', 'view_image', 'multi_agent', 'plugins', 'apps', 'skill_search', 'memories'].flatMap(name => ['--disable', name])];
}

function macPath(value: string) {
  return value.startsWith('/tmp/') || value.startsWith('/var/') ? `/private${value}` : value;
}
/** Seatbelt protects user data even from CLI-native file readers. OS/runtime
 * libraries remain readable; no model tool can access those either. This is
 * intentionally macOS-only and fails closed elsewhere, not a cwd-only fallback. */
export function frozenQaProfile(input: { readRoots: string[]; writeRoots: string[] }): string {
  const except = (roots: string[]) => roots.map(root => `(require-not (subpath ${JSON.stringify(macPath(root))}))`).join(' ');
  const userData = ['/Users', '/Volumes', '/private/tmp', '/private/var/folders', '/System/Volumes/Data/Users', '/System/Volumes/Data/private/tmp', '/System/Volumes/Data/private/var/folders'];
  return `(version 1)\n(allow default)\n${userData.map(root => `(deny file-read-data (require-all (subpath ${JSON.stringify(root)}) ${except([...input.readRoots, ...input.writeRoots])}))`).join('\n')}\n(deny file-write* (require-all ${except(input.writeRoots)} (require-not (literal "/dev/null"))))\n`;
}

export async function prepareFrozenQaInput(runRoot: string, images: Array<{path:string;sha256:string}>) {
  const parent = path.join(runRoot, 'qa-isolation');
  await mkdir(parent, {recursive:true});
  const root = await realpath(await mkdtemp(path.join(parent, 'review-')));
  const imagePaths = await Promise.all(images.map(async (image, index) => {
    const target = path.join(root, `${index + 1}-${image.sha256}${path.extname(image.path)}`);
    await copyFile(image.path, target);
    if (await sha256File(target) !== image.sha256) throw new Error('QA observation copy hash mismatch');
    return target;
  }));
  return {root, imagePaths};
}

export async function frozenQaLaunch(input: {root:string;logDir:string;command:string;env:NodeJS.ProcessEnv}) {
  if (process.platform !== 'darwin') throw new Error('QA_ISOLATION_UNAVAILABLE: frozen reviewer requires the verified macOS Seatbelt launcher on this host');
  const authHome = input.env.CODEX_HOME ?? path.join(input.env.HOME ?? homedir(), '.codex');
  const authPath = path.join(authHome, 'auth.json');
  if (!await exists(authPath)) throw new Error('QA_ISOLATION_UNAVAILABLE: file-backed ChatGPT login required; global login will not be changed');
  const home = path.join(input.root, 'home');
  const codexHome = path.join(home, '.codex');
  const temporary = path.join(input.root, 'tmp');
  await mkdir(codexHome, {recursive:true}); await mkdir(temporary);
  // A read-only link, not copied credentials or a login/config mutation.
  await symlink(await realpath(authPath), path.join(codexHome, 'auth.json'));
  const command = await realpath(path.isAbsolute(input.command) ? input.command : (await exec('/usr/bin/which', [input.command])).stdout.trim());
  const profile = frozenQaProfile({
    readRoots: [input.root, await realpath(authPath), path.dirname(path.dirname(command)), path.dirname(await realpath(process.execPath))],
    writeRoots: [temporary, codexHome, await realpath(input.logDir)],
  });
  const profilePath = path.join(input.logDir, 'qa-seatbelt.sb');
  await writeFile(profilePath, profile);
  return {command:'/usr/bin/sandbox-exec',prefix:['-f',profilePath,command],
    env:{...input.env, HOME:home, CODEX_HOME:codexHome, TMPDIR:temporary},profilePath};
}
