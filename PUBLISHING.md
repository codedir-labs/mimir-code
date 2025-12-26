# Publishing @codedir/mimir-code

Simple guide to publish this package to npm under the @codedir organization.

## About Scoped Packages

The package name `@codedir/mimir-code` is a **scoped package**:
- The `@codedir` prefix means it belongs to the `codedir` npm organization
- When you publish `@codedir/mimir-code`, it automatically publishes under the org (not your personal account)
- The `--access public` flag makes it publicly available (scoped packages are private by default)

## Prerequisites

1. **npm account** with access to @codedir organization
2. **Organization membership**: Ask @codedir org admin to add you as Developer or Admin
   - Org admin goes to: https://www.npmjs.com/settings/codedir/members
   - Adds you with "Developer" or "Admin" role

## Setup (One-Time)

### 1. Log in to npm

```bash
npm login
```

### 2. Verify organization access

```bash
npm org ls codedir
```

You should see your username listed. If not, contact the org admin.

### 3. Configure npm Trusted Publishers

This allows GitHub Actions to publish automatically without tokens.

1. **First publish** (manual, one-time only):
   ```bash
   npm run build
   npm publish --access public
   ```

2. **Configure Trusted Publisher** on npmjs.com:
   - Go to: https://www.npmjs.com/package/@codedir/mimir-code/access
   - Click "Publishing access" → "Trusted publishers"
   - Click "Add trusted publisher"
   - Fill in:
     - **Provider**: GitHub
     - **Repository owner**: `codedir-labs`
     - **Repository name**: `mimir-code`
     - **Workflow**: `release.yml`
   - Save

Done! Future releases will publish automatically from GitHub Actions.

## Creating a Release

### Automatic (Recommended)

Push to `main` branch and the workflow handles everything:

```bash
# Bump version
npm version patch  # or minor, or major

# Push to main
git push origin main
git push origin --tags
```

The GitHub Actions workflow will:
1. Run tests and security checks
2. Build binaries for all platforms
3. Create GitHub release (draft)
4. Test installation scripts
5. Publish to GitHub releases + npm

### Manual Publish

If you need to publish manually:

```bash
npm run build
npm publish --access public
```

## Troubleshooting

### "You do not have permission to publish"

**Solution**: Ask @codedir org admin to add you:
1. Go to: https://www.npmjs.com/settings/codedir/members
2. Add your username with "Developer" role

### "Package access level requires a paid account"

**Solution**: Use `--access public` flag:
```bash
npm publish --access public
```

### npm Trusted Publishers not working

**Solution**: Verify configuration matches exactly:
- Repository owner: `codedir-labs`
- Repository name: `mimir-code`
- Workflow: `release.yml`

## GitHub Repository

- **Organization**: codedir-labs
- **Repository**: https://github.com/codedir-labs/mimir-code
- **Releases**: https://github.com/codedir-labs/mimir-code/releases

## npm Package

- **Organization**: codedir
- **Package**: https://www.npmjs.com/package/@codedir/mimir-code
- **Install**: `npm install -g @codedir/mimir-code`

## That's It

Simple as that. Publish once manually, configure Trusted Publishers, then all future releases are automatic.
