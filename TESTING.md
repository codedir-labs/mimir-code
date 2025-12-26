# Testing Guide

## Local Testing

### Quick Build Test (Fastest - 5 seconds)

Just verify the build works without full installation:

**Unix (macOS/Linux):**
```bash
yarn test:build
```

**Windows:**
```powershell
yarn test:build:win
```

This will:
- ✅ Build the bundled CLI
- ✅ Test `node dist/cli.cjs --version`
- ✅ Show bundle size

### Full Installation Test (Complete - 30 seconds)

Test the installation scripts locally without pushing to GitHub:

**Unix (macOS/Linux):**
```bash
yarn test:install
```

**Windows:**
```powershell
yarn test:install:win
```

### What Gets Tested

The local installation test script:

1. ✅ **Builds the project** - Compiles TypeScript to bundled CommonJS
2. ✅ **Creates npm package** - Runs `npm pack` to create tarball
3. ✅ **Installs locally** - Installs from the tarball (simulates npm install)
4. ✅ **Verifies PATH** - Checks if `mimir` command is available
5. ✅ **Tests execution** - Runs `mimir --version`
6. ✅ **Tests init** - Runs `mimir init` and verifies `.mimir/` creation
7. ✅ **Tests upgrade** - Reinstalls and verifies config preservation
8. ✅ **Cleans up** - Uninstalls package and removes test files

### Manual Testing

If you want to manually test the package:

1. **Build and pack:**
   ```bash
   yarn build
   npm pack
   ```

2. **Install the tarball:**
   ```bash
   npm install -g ./codedir-mimir-code-0.1.0.tgz
   ```

3. **Test commands:**
   ```bash
   mimir --version
   mimir init
   ```

4. **Uninstall:**
   ```bash
   npm uninstall -g @codedir/mimir-code
   ```

### Testing Installation Scripts (curl/iwr method)

To test the curl/iwr installation method locally:

**Unix:**
```bash
# Serve the script locally (requires a simple HTTP server)
python3 -m http.server 8000 &

# Test installation
curl -fsSL http://localhost:8000/scripts/install.sh | bash

# Stop server
pkill -f "python3 -m http.server"
```

**Windows:**
```powershell
# Test with local file
.\scripts\install.ps1 -Version latest -TestMode
```

### CI/CD Pipeline Tests

The full CI/CD pipeline (`.github/workflows/release.yml`) tests:

- ✅ Installation from GitHub release binaries
- ✅ Installation from npm registry
- ✅ curl/bash piped installation
- ✅ iwr/iex piped installation
- ✅ Upgrade scenarios
- ✅ Uninstall scenarios
- ✅ All platforms (Ubuntu, macOS, Windows)

## Unit & Integration Tests

**Run all tests:**
```bash
yarn test
```

**Unit tests only:**
```bash
yarn test:unit
```

**Integration tests only:**
```bash
yarn test:integration
```

**Coverage report:**
```bash
yarn test:coverage
```

## Development Workflow

1. Make changes to code
2. Run unit tests: `yarn test:unit`
3. Build: `yarn build`
4. Test local installation: `yarn test:install`
5. If all passes, commit and push
6. CI/CD will run full test suite on all platforms

## Troubleshooting

### "mimir command not found" after installation

**Cause:** npm global bin directory not in PATH

**Fix:**
```bash
# Find npm global bin directory
npm bin -g

# Add to PATH (Unix)
export PATH="$(npm bin -g):$PATH"

# Add to PATH (Windows PowerShell)
$env:PATH = "$(npm bin -g);$env:PATH"
```

### "Dynamic require not supported" error

**Cause:** Native module (better-sqlite3) not properly externalized

**Fix:** Check `tsup.config.ts` has:
```typescript
external: ['better-sqlite3', 'fsevents']
```

### Config gets overwritten during upgrade

**Cause:** Installation script not preserving existing config

**Fix:** Check `scripts/install.sh` or `scripts/install.ps1`:
```bash
if [ ! -f "${INSTALL_DIR}/config.yml" ]; then
  # Only create if doesn't exist
fi
```

## Build Architecture

The CLI uses a **hybrid bundling approach**:

### What Gets Bundled:
- ✅ **Your code** - All `src/**/*.ts` files
- ✅ **Pure JS dependencies** - Libraries without native/ESM features
- ✅ **Utilities** - chalk, commander, zod, etc.

### What Stays External:
- ⚠️ **Native modules** - `better-sqlite3`, `fsevents` (use dynamic requires)
- ⚠️ **UI libraries** - `ink`, `react`, `yoga-layout` (use ESM features like top-level await)
- ⚠️ **React ecosystem** - Can't be bundled into CommonJS

**Why this approach?**
- 🚀 **Fast startup** - Bundled code loads faster
- 📦 **Smaller size** - Tree-shaking removes unused code
- ✅ **Compatibility** - ESM/native modules work correctly
- 🎯 **Best practice** - Used by esbuild, vite, tsx, etc.

### For npm:
```
dist/cli.cjs (bundled)
  ├─ require('better-sqlite3') → node_modules/better-sqlite3/
  ├─ require('ink') → node_modules/ink/
  └─ require('react') → node_modules/react/
```

### For pkg binaries:
```
mimir-code-linux-x64 (standalone)
  ├─ Bundled code (embedded)
  ├─ Node.js runtime (embedded)
  └─ Assets (embedded):
      ├─ node_modules/better-sqlite3/
      ├─ node_modules/ink/
      └─ node_modules/react/
```

## Debugging

**Enable verbose logging:**
```bash
# Unix
DEBUG=* yarn test:install

# Windows
$env:DEBUG="*"
yarn test:install:win
```

**Check package contents:**
```bash
# After npm pack
tar -tzf codedir-mimir-code-0.1.0.tgz

# Should include:
# - dist/cli.cjs (bundled code)
# - dist/index.js (ESM library)
# - package.json
# - node_modules/better-sqlite3/
# - node_modules/ink/
# - node_modules/react/
```

**Test bundled CLI directly:**
```bash
node dist/cli.cjs --version
```

**Check bundle size:**
```bash
ls -lh dist/cli.cjs
# Should be ~500KB-1MB (without node_modules)
```

**Test binary locally (after build:binary):**
```bash
./dist/binaries/mimir-code-linux-x64 --version
```
