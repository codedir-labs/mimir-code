#!/usr/bin/env bash
# Local installation test script for Unix (macOS, Linux)
# Tests the installation process without needing to push to GitHub

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Mimir Local Installation Test${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# Step 1: Build the project
echo -e "${BLUE}[1/5]${NC} Building project..."
cd "$ROOT_DIR"
yarn build

# Step 2: Create a test directory
echo -e "${BLUE}[2/5]${NC} Setting up test environment..."
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up test environment...${NC}"

    # Uninstall mimir if it was installed
    if command -v mimir &> /dev/null; then
        if command -v yarn &> /dev/null; then
            yarn global remove @codedir/mimir-code 2>/dev/null || true
        else
            npm uninstall -g @codedir/mimir-code 2>/dev/null || true
        fi
    fi

    # Remove test directory
    rm -rf "$TEST_DIR"

    echo -e "${GREEN}Cleanup complete${NC}"
}

trap cleanup EXIT

# Step 3: Pack the npm package locally
echo -e "${BLUE}[3/5]${NC} Creating local npm package..."
cd "$ROOT_DIR"
PACKAGE_FILE=$(npm pack)
PACKAGE_PATH="$ROOT_DIR/$PACKAGE_FILE"
echo "Package created: $PACKAGE_FILE"

# Step 4: Install from local package
echo -e "${BLUE}[4/5]${NC} Installing from local package..."
npm install -g "$PACKAGE_PATH"

# Step 5: Run verification tests
echo -e "${BLUE}[5/5]${NC} Running verification tests..."
echo ""

# Check if mimir is in PATH
echo -e "${BLUE}Test 1:${NC} Checking if mimir is in PATH..."
if ! command -v mimir &> /dev/null; then
    echo -e "${RED}✗ FAILED${NC} - mimir not found in PATH"
    exit 1
fi
echo -e "${GREEN}✓ PASSED${NC} - mimir found at: $(which mimir)"

# Check if mimir runs
echo -e "${BLUE}Test 2:${NC} Checking if mimir --version works..."
if ! mimir --version &> /dev/null; then
    echo -e "${RED}✗ FAILED${NC} - mimir --version failed"
    mimir --version 2>&1 || true
    exit 1
fi
VERSION=$(mimir --version)
echo -e "${GREEN}✓ PASSED${NC} - mimir version: $VERSION"

# Test mimir init
echo -e "${BLUE}Test 3:${NC} Testing mimir init..."
cd "$TEST_DIR"
if ! timeout 30s mimir init --no-interactive 2>&1; then
    echo -e "${RED}✗ FAILED${NC} - mimir init failed or timed out"
    exit 1
fi

if [ ! -d ".mimir" ] || [ ! -f ".mimir/config.yml" ]; then
    echo -e "${RED}✗ FAILED${NC} - .mimir directory or config.yml not created"
    exit 1
fi
echo -e "${GREEN}✓ PASSED${NC} - mimir init successful"

# Test config preservation (upgrade simulation)
echo -e "${BLUE}Test 4:${NC} Testing config preservation during upgrade..."
echo "# Custom setting" >> .mimir/config.yml
echo "testValue: true" >> .mimir/config.yml

# Reinstall (simulate upgrade)
npm install -g "$PACKAGE_PATH" --force

if ! grep -q "testValue" .mimir/config.yml; then
    echo -e "${RED}✗ FAILED${NC} - Custom config was overwritten"
    exit 1
fi
echo -e "${GREEN}✓ PASSED${NC} - Config preserved during upgrade"

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ All tests passed!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "Test summary:"
echo "  ✓ mimir installed successfully"
echo "  ✓ mimir --version works"
echo "  ✓ mimir init works"
echo "  ✓ Config preservation works"
echo ""
echo "Package file: $PACKAGE_FILE"
echo "You can manually test with: npm install -g $PACKAGE_PATH"
echo ""
