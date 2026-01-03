#!/usr/bin/env bash
#
# Setup GitHub repository variables for CI/CD workflows
#
# Usage:
#   .github/setup-variables.sh
#
# Requirements:
#   - gh CLI installed and authenticated (https://cli.github.com/)
#   - Write access to the repository
#
# Run this once when setting up the repository or after cloning.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Setting up GitHub repository variables..."
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: gh CLI is not installed${NC}"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: gh CLI is not authenticated${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Define variables
# NODE_VERSION: Used across all workflows for consistent Node.js version
echo -n "Setting NODE_VERSION=22... "
if gh variable set NODE_VERSION --body "22" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}Updated${NC}"
fi

echo ""
echo -e "${GREEN}Repository variables configured successfully!${NC}"
echo ""
echo "Current variables:"
gh variable list

echo ""
echo "Usage in workflows:"
echo '  node-version: ${{ vars.NODE_VERSION || '"'"'22'"'"' }}'
