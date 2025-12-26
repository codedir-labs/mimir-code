#!/usr/bin/env bash
# Quick build test - verifies the build works without full installation
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Building project...${NC}"
cd "$ROOT_DIR"
yarn build

if [ ! -f "dist/cli.mjs" ]; then
    echo -e "${RED}✗ FAILED${NC} - dist/cli.mjs not found"
    exit 1
fi

if [ ! -f "dist/cli.cjs" ]; then
    echo -e "${RED}✗ FAILED${NC} - dist/cli.cjs not found (needed for pkg)"
    exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"
echo ""
echo "Testing bundled CLI directly..."
node dist/cli.mjs --version

echo ""
echo -e "${GREEN}✓ All checks passed!${NC}"
echo ""
echo "Bundle sizes:"
ls -lh dist/cli.mjs dist/cli.cjs
echo ""
echo "To test installation: yarn test:install"
