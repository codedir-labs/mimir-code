#!/usr/bin/env bash
# Mimir Code Installation Script for Unix (macOS, Linux)

set -e

# Parse arguments
VERSION="${1:-latest}"  # First argument: version to install (default: latest)
TEST_MODE="${2:-false}"  # Second argument: enable test mode with verification

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

    # Detect OS (GitHub convention: darwin for macOS, linux for Linux)
    case "$(uname -s)" in
        Darwin*)
            os="darwin"
            ;;
        Linux*)
            os="linux"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    # Detect architecture (GitHub convention: amd64 for x86_64, arm64 for ARM)
    case "$(uname -m)" in
        x86_64|amd64)
            arch="amd64"
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
    print_info "Installing Mimir Code..."

    local platform=$(detect_platform)
    print_info "Detected platform: ${platform}"

    # Determine release tag
    local release_tag
    if [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        release_tag="$VERSION"
    elif [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        release_tag="v$VERSION"
    else
        # For 'latest' or other non-version strings, fetch latest release
        print_info "Fetching latest release tag..."
        if command -v curl &> /dev/null; then
            release_tag=$(curl -s "${LATEST_RELEASE_URL}" | grep '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
        elif command -v wget &> /dev/null; then
            release_tag=$(wget -qO- "${LATEST_RELEASE_URL}" | grep '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
        fi

        if [ -z "$release_tag" ]; then
            print_error "Failed to fetch latest release tag"
            print_error ""
            print_error "Please try installing via npm instead:"
            print_error "  npm install -g @codedir/mimir-code"
            print_error ""
            print_error "If this issue persists, please report it:"
            print_error "  https://github.com/${GITHUB_REPO}/issues"
            exit 1
        fi
    fi

    print_info "Downloading from GitHub release ${release_tag}..."

    local binary_name="mimir-code-${platform}"
    local download_url="https://github.com/${GITHUB_REPO}/releases/download/${release_tag}/${binary_name}"
    local tmp_binary="${BIN_DIR}/mimir"
    mkdir -p "${BIN_DIR}"

    # Try to download the binary
    local download_success=false
    if command -v curl &> /dev/null; then
        if curl -L -f -o "${tmp_binary}" "${download_url}" 2>/dev/null; then
            download_success=true
        fi
    elif command -v wget &> /dev/null; then
        if wget -O "${tmp_binary}" "${download_url}" 2>/dev/null; then
            download_success=true
        fi
    fi

    if [ "$download_success" = true ]; then
        chmod +x "${tmp_binary}"
        print_success "Mimir Code binary installed from GitHub release"

        # Download WASM file to resources directory
        print_info "Downloading WASM resources..."
        mkdir -p "${BIN_DIR}/resources"
        local wasm_url="https://github.com/${GITHUB_REPO}/releases/download/${release_tag}/sql-wasm.wasm"
        local wasm_path="${BIN_DIR}/resources/sql-wasm.wasm"

        local wasm_success=false
        if command -v curl &> /dev/null; then
            if curl -L -f -o "${wasm_path}" "${wasm_url}" 2>/dev/null; then
                wasm_success=true
            fi
        elif command -v wget &> /dev/null; then
            if wget -O "${wasm_path}" "${wasm_url}" 2>/dev/null; then
                wasm_success=true
            fi
        fi

        if [ "$wasm_success" = true ]; then
            print_success "WASM resources installed"
        else
            print_warning "Failed to download WASM file, will use fallback if available"
        fi

        return 0
    fi

    # Installation failed
    print_error "Failed to download binary from GitHub release"
    print_error "URL: ${download_url}"
    print_error ""
    print_error "Please try installing via npm instead:"
    print_error "  npm install -g @codedir/mimir-code"
    print_error ""
    print_error "Or install a specific version:"
    print_error "  npm install -g @codedir/mimir-code@0.1.0"
    print_error ""
    print_error "If this issue persists, please report it:"
    print_error "  https://github.com/${GITHUB_REPO}/issues"
    exit 1
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

# Verify installation (for CI/testing)
verify_installation() {
    print_info "Verifying installation..."

    # Update PATH for current shell session to include npm/yarn global bin
    if command -v yarn &> /dev/null; then
        export PATH="$(yarn global bin):$PATH"
    elif command -v npm &> /dev/null; then
        export PATH="$(npm bin -g):$PATH"
    fi

    # Also add common locations
    export PATH="${BIN_DIR}:${HOME}/.yarn/bin:${HOME}/.config/yarn/global/node_modules/.bin:$PATH"

    # Check if mimir is in PATH
    if ! command -v mimir &> /dev/null; then
        print_error "mimir not found in PATH"
        print_info "PATH: $PATH"
        return 1
    fi
    print_success "mimir found in PATH: $(which mimir)"

    # Check if mimir runs
    if ! mimir --version &> /dev/null; then
        print_error "mimir --version failed"
        mimir --version 2>&1 || true  # Show the error
        return 1
    fi
    local installed_version=$(mimir --version)
    print_success "mimir version: $installed_version"

    # Test mimir init in a temporary directory
    local test_dir=$(mktemp -d)
    (
        cd "$test_dir"
        print_info "Testing mimir init in: $test_dir"

        # Run init with quiet flag (output to variable to capture errors)
        init_output=$(timeout 30s mimir init --no-interactive --quiet 2>&1)
        init_exit_code=$?

        if [ $init_exit_code -ne 0 ]; then
            print_error "mimir init failed with exit code $init_exit_code"
            echo "$init_output"
            rm -rf "$test_dir"
            return 1
        fi

        if [ ! -d ".mimir" ] || [ ! -f ".mimir/config.yml" ]; then
            print_error ".mimir directory or config.yml not created"
            ls -la
            rm -rf "$test_dir"
            return 1
        fi

        print_success "mimir init works correctly"
    )
    rm -rf "$test_dir"

    # Test mimir doctor
    if timeout 30s mimir doctor 2>&1 > /dev/null; then
        print_success "mimir doctor passed"
    else
        print_warning "mimir doctor reported issues (non-fatal)"
    fi

    echo ""
    print_success "All verification tests passed!"
}

# Check for existing installation and backup if upgrading
check_existing_installation() {
    if [ -f "${BIN_DIR}/mimir" ]; then
        local current_version=$(${BIN_DIR}/mimir --version 2>/dev/null || echo "unknown")
        print_info "Found existing installation: ${current_version}"

        # Backup old binary
        if [ "$current_version" != "unknown" ]; then
            local backup_path="${BIN_DIR}/mimir.backup-${current_version}"
            cp "${BIN_DIR}/mimir" "${backup_path}"
            print_info "Backed up to ${backup_path}"
        fi
    fi
}

# Main installation
main() {
    # We'll set these after fetching the version
    local INSTALL_VERSION=""
    local IS_UPGRADE=false

    # Check for existing installation first
    if [ -f "${BIN_DIR}/mimir" ]; then
        IS_UPGRADE=true
    fi

    # Check dependencies early
    check_dependencies

    # Determine what version we're installing (needed for header)
    local release_tag=""
    if [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        release_tag="$VERSION"
        INSTALL_VERSION="${VERSION#v}"  # Remove 'v' prefix
    elif [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        release_tag="v$VERSION"
        INSTALL_VERSION="$VERSION"
    else
        # Fetch latest release tag
        if command -v curl &> /dev/null; then
            release_tag=$(curl -s "${LATEST_RELEASE_URL}" | grep '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
        elif command -v wget &> /dev/null; then
            release_tag=$(wget -qO- "${LATEST_RELEASE_URL}" | grep '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
        fi
        INSTALL_VERSION="${release_tag#v}"  # Remove 'v' prefix
    fi

    echo ""
    echo "╔═══════════════════════════════════════╗"
    if [ "$IS_UPGRADE" = true ]; then
        echo "║    Mimir Code Installer v${INSTALL_VERSION}        ║"
        echo "║   Upgrading Platform-agnostic CLI     ║"
    else
        echo "║    Mimir Code Installer v${INSTALL_VERSION}        ║"
        echo "║   Platform-agnostic AI Coding CLI     ║"
    fi
    echo "╚═══════════════════════════════════════╝"
    echo ""

    if [ "$IS_UPGRADE" = true ]; then
        check_existing_installation
    fi

    create_directories
    install_binary
    setup_config
    update_shell_profile

    echo ""
    print_success "Installation complete!"

    # Run verification if in test mode
    if [ "$TEST_MODE" = "true" ] || [ "$TEST_MODE" = "1" ]; then
        echo ""
        print_info "Running verification tests..."
        verify_installation
    else
        echo ""
        print_info "Start building with AI:"
        print_info "  mimir"
        echo ""
        print_info "Set your API key: ${INSTALL_DIR}/config.yml"
        print_info "Documentation: https://github.com/${GITHUB_REPO}"
        echo ""
    fi
}

# Run installation
main
