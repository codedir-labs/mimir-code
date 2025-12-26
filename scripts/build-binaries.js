#!/usr/bin/env node
/**
 * Build script for creating cross-platform binaries using Bun
 *
 * This script builds standalone executables for all supported platforms.
 * It requires Bun to be installed and uses Bun's built-in cross-compilation.
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const binariesDir = join(rootDir, 'dist', 'binaries');

// Target platforms for Bun compile
const targets = [
  { platform: 'linux', arch: 'x64', target: 'bun-linux-x64', output: 'mimir-code-linux-amd64' },
  { platform: 'darwin', arch: 'x64', target: 'bun-darwin-x64', output: 'mimir-code-darwin-amd64' },
  { platform: 'darwin', arch: 'arm64', target: 'bun-darwin-arm64', output: 'mimir-code-darwin-arm64' },
  { platform: 'windows', arch: 'x64', target: 'bun-windows-x64', output: 'mimir-code-windows-amd64.exe' },
];

console.log('🔨 Building Mimir Code binaries with Bun...\n');

// Create binaries directory
if (!existsSync(binariesDir)) {
  mkdirSync(binariesDir, { recursive: true });
  console.log(`✅ Created ${binariesDir}\n`);
}

// Build for each target
for (const { platform, arch, target, output } of targets) {
  console.log(`📦 Building for ${platform}-${arch} (${target})...`);

  const entryPoint = join(rootDir, 'src', 'cli.ts');
  const outputPath = join(binariesDir, output);

  try {
    execSync(
      `bun build ${entryPoint} --compile --target=${target} --outfile=${outputPath}`,
      {
        cwd: rootDir,
        stdio: 'inherit',
        env: { ...process.env }
      }
    );
    console.log(`✅ Built: ${output}\n`);
  } catch (error) {
    console.error(`❌ Failed to build ${output}`);
    console.error(error.message);
    process.exit(1);
  }
}

console.log('🎉 All binaries built successfully!');
console.log(`\nBinaries location: ${binariesDir}`);
