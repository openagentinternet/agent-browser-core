import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { BROWSER_WORKSPACES } from './browser-workspaces.mjs';

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMMONJS_PACKAGE_MARKER = `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`;

export async function writeCommonJsPackageMarkers(repoRoot = DEFAULT_REPO_ROOT) {
  for (const workspace of BROWSER_WORKSPACES) {
    const distCjsPath = join(repoRoot, workspace.path, 'dist-cjs');
    await mkdir(distCjsPath, { recursive: true });
    await writeFile(join(distCjsPath, 'package.json'), COMMONJS_PACKAGE_MARKER);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeCommonJsPackageMarkers();
}
