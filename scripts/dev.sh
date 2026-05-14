#!/usr/bin/env bash
# =============================================================================
# FileArk - Development Environment Startup Script
# =============================================================================
# Usage:
#   ./scripts/dev.sh          # Start full dev environment
#   ./scripts/dev.sh --help   # Show help
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Pre-flight Checks ───────────────────────────────────────────────────────

check_prerequisites() {
    local missing=0

    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Install from https://nodejs.org"
        missing=1
    fi

    if ! command -v pnpm &> /dev/null && ! command -v npm &> /dev/null; then
        error "Neither pnpm nor npm found. Install a package manager."
        missing=1
    fi

    if ! command -v cargo &> /dev/null; then
        error "Rust/Cargo is not installed. Install from https://rustup.rs"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        exit 1
    fi

    ok "All prerequisites satisfied"
}

# ─── Install Dependencies ─────────────────────────────────────────────────────

install_deps() {
    info "Installing frontend dependencies..."

    if [ -f "$PROJECT_ROOT/pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    elif [ -f "$PROJECT_ROOT/package-lock.json" ]; then
        npm ci 2>/dev/null || npm install
    else
        pnpm install 2>/dev/null || npm install
    fi

    ok "Dependencies installed"
}

# ─── Start Dev Server ─────────────────────────────────────────────────────────

start_dev() {
    echo ""
    echo "========================================"
    echo "   FileArk Development Environment"
    echo "========================================"
    echo ""

    cd "$PROJECT_ROOT"
    check_prerequisites
    install_deps

    echo ""
    info "Starting Tauri dev server (frontend + backend)..."
    info "Frontend: http://127.0.0.1:5173"
    info "Press Ctrl+C to stop"
    echo ""

    # Use tauri dev which starts both frontend and backend
    npx tauri dev
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-}" in
    --help|-h)
        echo "Usage: ./scripts/dev.sh"
        echo ""
        echo "Start the FileArk development environment."
        echo "This runs 'tauri dev' which starts both the Vite frontend"
        echo "dev server and the Rust backend."
        ;;
    *)
        start_dev
        ;;
esac
