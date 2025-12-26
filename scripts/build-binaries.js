#!/usr/bin/env node

import { execSync } from 'child_process';
import { mkdirSync, existsSync, copyFileSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const tar = require('tar');
const AdmZip = require('adm-zip');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const binariesDir = join(rootDir, 'dist', 'binaries');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

const targets = [
  { platform: 'linux', arch: 'x64', target: 'bun-linux-x64', output: 'mimir-code-linux-amd64' },
  { platform: 'darwin', arch: 'x64', target: 'bun-darwin-x64', output: 'mimir-code-darwin-amd64' },
  { platform: 'darwin', arch: 'arm64', target: 'bun-darwin-arm64', output: 'mimir-code-darwin-arm64' },
  { platform: 'windows', arch: 'x64', target: 'bun-windows-x64', output: 'mimir-code-windows-amd64.exe' },
];

const externals = ['fsevents'];

console.log(`Building Mimir Code v${version}...\n`);

// Create binaries directory
if (!existsSync(binariesDir)) {
  mkdirSync(binariesDir, { recursive: true });
}

console.log('Step 1: Compiling binaries...\n');

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
    console.log(`✅ Built: ${output}\n`);
  } catch (error) {
    console.error(`❌ Failed to build ${output}`);
    console.error(error.message);
    process.exit(1);
  }
}

console.log('Step 2: Creating distribution packages...\n');

// Create staging directory for each platform
for (const { platform, output } of targets) {
  const isWindows = platform === 'windows';
  const archiveName = `mimir-code-v${version}-${output.replace('mimir-code-', '').replace('.exe', '')}`;
  const stagingDir = join(binariesDir, 'staging', archiveName);

  // Create staging directory
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  mkdirSync(stagingDir, { recursive: true });

  // Copy binary
  const binarySource = join(binariesDir, output);
  const binaryDest = join(stagingDir, isWindows ? 'mimir.exe' : 'mimir');
  copyFileSync(binarySource, binaryDest);

  // Create resources directory and copy WASM
  const resourcesDir = join(stagingDir, 'resources');
  mkdirSync(resourcesDir, { recursive: true });
  const wasmSource = join(rootDir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmDest = join(resourcesDir, 'sql-wasm.wasm');
  copyFileSync(wasmSource, wasmDest);

  // Copy README
  const readmeContent = `# Mimir Code v${version}

Platform-agnostic AI coding agent CLI

## Installation

Extract this archive and run the installer:

### Unix (macOS/Linux)
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/codedir-labs/mimir-code/main/scripts/install.sh | bash
\`\`\`

### Windows (PowerShell)
\`\`\`powershell
irm https://raw.githubusercontent.com/codedir-labs/mimir-code/main/scripts/install.ps1 | iex
\`\`\`

## Manual Installation

1. Copy \`mimir${isWindows ? '.exe' : ''}\` to a directory in your PATH (e.g., \`~/.local/bin\` or \`C:\\Users\\<user>\\.local\\bin\`)
2. Copy the \`resources/\` directory to the same location
3. Run \`mimir --version\` to verify

## Directory Structure
\`\`\`
${isWindows ? '.local/bin/' : '~/.local/bin/'}
├── mimir${isWindows ? '.exe' : ''}
└── resources/
    └── sql-wasm.wasm
\`\`\`

## Documentation
https://github.com/codedir-labs/mimir-code

## License
AGPL-3.0
`;

  const readmePath = join(stagingDir, 'README.md');
  require('fs').writeFileSync(readmePath, readmeContent);

  // Create archive
  try {
    if (isWindows) {
      // Create ZIP for Windows
      const zip = new AdmZip();
      zip.addLocalFolder(stagingDir);
      const zipPath = join(binariesDir, `${archiveName}.zip`);
      zip.writeZip(zipPath);
      console.log(`✅ Created: ${archiveName}.zip`);
    } else {
      // Create tar.gz for Unix
      const tarPath = join(binariesDir, `${archiveName}.tar.gz`);
      await tar.create(
        {
          gzip: true,
          file: tarPath,
          cwd: join(binariesDir, 'staging'),
        },
        [archiveName]
      );
      console.log(`✅ Created: ${archiveName}.tar.gz`);
    }
  } catch (error) {
    console.error(`❌ Failed to create archive for ${output}`);
    console.error(error.message);
  }
}

// Clean up staging directory
const stagingRoot = join(binariesDir, 'staging');
if (existsSync(stagingRoot)) {
  rmSync(stagingRoot, { recursive: true, force: true });
}

console.log('\n🎉 All distribution packages created successfully!');
console.log(`\n📦 Location: ${binariesDir}`);
console.log('\n📤 Upload these files to GitHub release:');
targets.forEach(({ platform, output }) => {
  const archiveName = `mimir-code-v${version}-${output.replace('mimir-code-', '').replace('.exe', '')}`;
  const ext = platform === 'windows' ? '.zip' : '.tar.gz';
  console.log(`   • ${archiveName}${ext}`);
});
