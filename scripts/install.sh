#!/usr/bin/env bash
# Mimir Code Installation Script for Unix (macOS, Linux)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="${HOME}/.mimir"
BIN_DIR="${HOME}/.local/bin"
GITHUB_REPO="codedir-labs/mimir-code"
LATEST_RELEASE_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"

# Functions
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS and architecture
detect_platform() {
    local os=""
    local arch=""

    # Detect OS
    case "$(uname -s)" in
        Darwin*)
            os="macos"
            ;;
        Linux*)
            os="linux"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x64"
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    echo "${os}-${arch}"
}

# Check dependencies
check_dependencies() {
    print_info "Checking dependencies..."

    # Check for curl or wget
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        print_error "curl or wget is required but not installed."
        exit 1
    fi

    # Check for Node.js
    if ! command -v node &> /dev/null; then
        print_warning "Node.js is not installed. Mimir Code requires Node.js 18 or higher."
        print_info "Please install Node.js from https://nodejs.org/"
        exit 1
    fi

    # Check Node.js version
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js version 18 or higher is required. Current version: $(node -v)"
        exit 1
    fi

    print_success "All dependencies satisfied"
}

# Create directories
create_directories() {
    print_info "Creating directories..."

    mkdir -p "${INSTALL_DIR}"
    mkdir -p "${BIN_DIR}"

    print_success "Directories created"
}

# Download and install binary
install_binary() {
    print_info "Downloading Mimir Code..."

    local platform=$(detect_platform)
    print_info "Detected platform: ${platform}"

    # Create temporary directory
    local tmp_dir=$(mktemp -d)
    cd "${tmp_dir}"

    # Download latest release
    # For now, we'll use npm install since binaries aren't published yet
    print_info "Installing via npm..."

    if command -v yarn &> /dev/null; then
        yarn global add @codedir/mimir-code
    else
        npm install -g @codedir/mimir-code
    fi

    print_success "Mimir Code installed successfully"
}

# Set up configuration
setup_config() {
    print_info "Setting up configuration..."

    if [ ! -f "${INSTALL_DIR}/config.yml" ]; then
        cat > "${INSTALL_DIR}/config.yml" <<EOF
# Mimir Code Configuration
# See https://github.com/${GITHUB_REPO} for documentation

llm:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7
  maxTokens: 4096

permissions:
  autoAccept: false
  acceptRiskLevel: medium
  alwaysAcceptCommands: []

keyBindings:
  interrupt: Ctrl+C
  modeSwitch: Shift+Tab
  editCommand: Ctrl+E

docker:
  enabled: true
  baseImage: alpine:latest

ui:
  theme: mimir
  syntaxHighlighting: true
  showLineNumbers: true
  compactMode: false
EOF
        print_success "Default configuration created at ${INSTALL_DIR}/config.yml"
    else
        print_info "Configuration already exists"
    fi
}

# Update shell profile
update_shell_profile() {
    print_info "Updating shell profile..."

    local shell_profile=""

    # Detect shell and profile file
    if [ -n "$ZSH_VERSION" ]; then
        shell_profile="${HOME}/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        if [ -f "${HOME}/.bashrc" ]; then
            shell_profile="${HOME}/.bashrc"
        elif [ -f "${HOME}/.bash_profile" ]; then
            shell_profile="${HOME}/.bash_profile"
        fi
    fi

    if [ -n "$shell_profile" ]; then
        # Check if already in PATH
        if ! grep -q "${BIN_DIR}" "$shell_profile" 2>/dev/null; then
            echo "" >> "$shell_profile"
            echo "# Mimir Code" >> "$shell_profile"
            echo "export PATH=\"\${PATH}:${BIN_DIR}\"" >> "$shell_profile"
            print_success "Updated ${shell_profile}"
            print_warning "Please run: source ${shell_profile}"
        else
            print_info "PATH already configured"
        fi
    fi
}

# Main installation
main() {
    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║     Mimir Code Installer         ║"
    echo "║   Platform-agnostic AI Coding CLI     ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""

    check_dependencies
    create_directories
    install_binary
    setup_config
    update_shell_profile

    echo ""
    print_success "Installation complete!"
    echo ""
    print_info "To get started:"
    print_info "  1. Set your API key in ${INSTALL_DIR}/config.yml"
    print_info "  2. Run: mimir setup"
    print_info "  3. Start coding: mimir"
    echo ""
    print_info "Documentation: https://github.com/${GITHUB_REPO}"
    echo ""
}

# Run installation
main
