#!/usr/bin/env bash
# Mimir Code Uninstallation Script for Unix (macOS, Linux)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Main uninstallation
main() {
    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║    Mimir Code Uninstaller        ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""

    print_warning "This will remove Mimir Code from your system."
    echo ""

    # Remove global npm/yarn package
    print_info "Removing Mimir Code package..."

    if command -v yarn &> /dev/null; then
        print_info "Detected yarn, removing global package..."
        yarn global remove @codedir/mimir-code || print_warning "Package not found or already removed"
    elif command -v npm &> /dev/null; then
        print_info "Detected npm, removing global package..."
        npm uninstall -g @codedir/mimir-code || print_warning "Package not found or already removed"
    else
        print_error "Neither npm nor yarn found. Cannot remove package."
    fi

    # Ask about configuration
    echo ""
    print_warning "Configuration directory: ~/.mimir"
    echo "This contains:"
    echo "  • config.yml (your settings and API keys)"
    echo "  • mimir.db (conversation history)"
    echo "  • logs/ (application logs)"
    echo ""

    read -p "$(echo -e ${YELLOW}Remove configuration directory? [y/N]: ${NC})" -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -d "$HOME/.mimir" ]; then
            # Create backup before deletion
            BACKUP_DIR="$HOME/.mimir_backup_$(date +%Y%m%d_%H%M%S)"
            print_info "Creating backup at $BACKUP_DIR"
            cp -r "$HOME/.mimir" "$BACKUP_DIR"

            # Remove directory
            rm -rf "$HOME/.mimir"
            print_success "Configuration removed (backup saved to $BACKUP_DIR)"
        else
            print_info "Configuration directory not found"
        fi
    else
        print_info "Configuration preserved at ~/.mimir"
    fi

    # Remove shell profile entries (optional)
    echo ""
    read -p "$(echo -e ${YELLOW}Remove PATH entries from shell profile? [y/N]: ${NC})" -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Detect shell profile
        if [ -f "$HOME/.bashrc" ]; then
            sed -i.bak '/# Mimir Code/d; /# Mimir/d; /mimir/d' "$HOME/.bashrc" 2>/dev/null || true
            print_success "Cleaned up .bashrc"
        fi

        if [ -f "$HOME/.zshrc" ]; then
            sed -i.bak '/# Mimir Code/d; /# Mimir/d; /mimir/d' "$HOME/.zshrc" 2>/dev/null || true
            print_success "Cleaned up .zshrc"
        fi
    else
        print_info "Shell profile unchanged"
    fi

    echo ""
    print_success "Uninstallation complete!"
    echo ""
    print_info "Thank you for using Mimir Code!"
    echo ""
}

# Run uninstallation
main
