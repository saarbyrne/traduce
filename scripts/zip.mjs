// Builds dist/traduce-<version>.zip for the Chrome Web Store. Needs the `zip` command.
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== version) {
  console.error(`manifest.json is ${version} but package.json is ${pkg.version}`);
  process.exit(1);
}
mkdirSync('dist', { recursive: true });
const out = `dist/traduce-${version}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, 'manifest.json', 'src', 'icons', '-x', '*.DS_Store'], { stdio: 'inherit' });
console.log(`\n${out}`);
