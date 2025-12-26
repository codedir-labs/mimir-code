#!/usr/bin/env node

import { execSync } from 'child_process';
import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const binariesDir = join(rootDir, 'dist', 'binaries');

const targets = [
  { platform: 'linux', arch: 'x64', target: 'bun-linux-x64', output: 'mimir-code-linux-amd64' },
  { platform: 'darwin', arch: 'x64', target: 'bun-darwin-x64', output: 'mimir-code-darwin-amd64' },
  { platform: 'darwin', arch: 'arm64', target: 'bun-darwin-arm64', output: 'mimir-code-darwin-arm64' },
  { platform: 'windows', arch: 'x64', target: 'bun-windows-x64', output: 'mimir-code-windows-amd64.exe' },
];

const externals = [
  'fsevents',
];

console.log('Building binaries...\n');

// Create binaries and resources directories
if (!existsSync(binariesDir)) {
  mkdirSync(binariesDir, { recursive: true });
}

const resourcesDir = join(binariesDir, 'resources');
if (!existsSync(resourcesDir)) {
  mkdirSync(resourcesDir, { recursive: true });
}

// Copy WASM files to resources directory
console.log('Step 1: Copying WASM files to resources directory...');
const wasmSource = join(rootDir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const wasmDest = join(resourcesDir, 'sql-wasm.wasm');

try {
  copyFileSync(wasmSource, wasmDest);
  console.log(`✅ Copied sql-wasm.wasm to resources/`);
  console.log('');
} catch (error) {
  console.error('Failed to copy WASM files');
  console.error(error.message);
  process.exit(1);
}

console.log('Step 2: Compiling binaries...\n');

for (const { platform, arch, target, output } of targets) {
  console.log(`Building for ${platform}-${arch}...`);

  const entryPoint = join(rootDir, 'src', 'cli.ts');
  const outputPath = join(binariesDir, output);
  const externalFlags = externals.map(pkg => `--external ${pkg}`).join(' ');

  try {
    execSync(
      `bun build ${entryPoint} --compile --target=${target} --minify --sourcemap=external ${externalFlags} --outfile=${outputPath}`,
      {
        cwd: rootDir,
        stdio: 'inherit',
        env: { ...process.env }
      }
    );
    console.log(`Built: ${output}\n`);
  } catch (error) {
    console.error(`Failed to build ${output}`);
    console.error(error.message);
    process.exit(1);
  }
}

// Copy WASM file to binaries directory for GitHub release
console.log('Copying WASM file to binaries directory for release...');
const wasmReleaseSource = join(resourcesDir, 'sql-wasm.wasm');
const wasmReleaseDest = join(binariesDir, 'sql-wasm.wasm');

try {
  copyFileSync(wasmReleaseSource, wasmReleaseDest);
  console.log(`✅ Copied sql-wasm.wasm to binaries directory for GitHub release`);
} catch (error) {
  console.error('Failed to copy WASM file for release');
  console.error(error.message);
}

console.log('\nAll binaries built successfully!');
console.log(`Location: ${binariesDir}`);
console.log('\nFor GitHub release, upload these files:');
targets.forEach(({ output }) => console.log(`  - ${output}`));
console.log('  - sql-wasm.wasm');
console.log('  - resources/ directory (optional, for manual installations)');
