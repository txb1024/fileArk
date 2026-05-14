#!/usr/bin/env bash
# =============================================================================
# FileArk - Production Build Script
# =============================================================================
# Usage:
#   ./scripts/build.sh              # Full build (typecheck + frontend + tauri)
#   ./scripts/build.sh --frontend    # Frontend only
#   ./scripts/build.sh --tauri       # Tauri app only (assumes frontend built)
#   ./scripts/build.sh --check       # Run all checks (typecheck + lint + test)
#   ./scripts/build.sh --help        # Show help
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

step=0
total_steps=1

next_step() {
    step=$((step + 1))
    echo ""
    info "Step ${step}/${total_steps}: $1"
    echo "────────────────────────────────────────"
}

# ─── Pre-flight Checks ───────────────────────────────────────────────────────

check_prerequisites() {
    local missing=0

    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        missing=1
    fi

    if ! command -v cargo &> /dev/null; then
        error "Rust/Cargo is not installed"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        exit 1
    fi
}

# ─── Install Dependencies ─────────────────────────────────────────────────────

install_deps() {
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        info "Installing dependencies..."
        cd "$PROJECT_ROOT"
        if [ -f "pnpm-lock.yaml" ]; then
            pnpm install --frozen-lockfile 2>/dev/null || pnpm install
        else
            npm ci 2>/dev/null || npm install
        fi
        ok "Dependencies installed"
    fi
}

# ─── Type Check ───────────────────────────────────────────────────────────────

run_typecheck() {
    info "Running TypeScript type check..."
    cd "$PROJECT_ROOT"
    npx tsc --noEmit
    ok "Type check passed"
}

# ─── Lint ─────────────────────────────────────────────────────────────────────

run_lint() {
    info "Running ESLint..."
    cd "$PROJECT_ROOT"
    npx eslint src --max-warnings=0
    ok "Lint check passed"
}

# ─── Test ─────────────────────────────────────────────────────────────────────

run_test() {
    info "Running tests..."
    cd "$PROJECT_ROOT"
    npx vitest run
    ok "All tests passed"
}

# ─── Frontend Build ───────────────────────────────────────────────────────────

build_frontend() {
    info "Building frontend (Vite)..."
    cd "$PROJECT_ROOT"
    npx vite build
    ok "Frontend built → dist/"
}

# ─── Tauri Build ──────────────────────────────────────────────────────────────

build_tauri() {
    info "Building Tauri application..."
    cd "$PROJECT_ROOT"
    npx tauri build
    ok "Tauri app built → src-tauri/target/release/bundle/"
}

# ─── Full Build ───────────────────────────────────────────────────────────────

build_full() {
    total_steps=4

    echo ""
    echo "========================================"
    echo "   FileArk Production Build"
    echo "========================================"

    check_prerequisites
    install_deps

    next_step "TypeScript type check"
    run_typecheck

    next_step "Frontend build (Vite)"
    build_frontend

    next_step "Tauri application build"
    build_tauri

    next_step "Build summary"
    echo ""
    ok "Build completed successfully!"
    echo ""

    # Show output location
    if [ -d "$PROJECT_ROOT/src-tauri/target/release/bundle" ]; then
        info "Installer location:"
        find "$PROJECT_ROOT/src-tauri/target/release/bundle" -name "*.exe" -o -name "*.msi" 2>/dev/null | while read -r f; do
            echo "  📦 $f"
        done
    fi

    if [ -d "$PROJECT_ROOT/dist" ]; then
        info "Frontend output: dist/ ($(du -sh "$PROJECT_ROOT/dist" | cut -f1))"
    fi
}

# ─── Checks Only ──────────────────────────────────────────────────────────────

run_checks() {
    total_steps=3

    echo ""
    echo "========================================"
    echo "   FileArk Code Quality Checks"
    echo "========================================"

    check_prerequisites
    install_deps

    next_step "TypeScript type check"
    run_typecheck

    next_step "ESLint check"
    run_lint

    next_step "Unit tests"
    run_test

    echo ""
    ok "All checks passed!"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-}" in
    --frontend)
        check_prerequisites
        install_deps
        run_typecheck
        build_frontend
        ;;
    --tauri)
        check_prerequisites
        if [ ! -d "$PROJECT_ROOT/dist" ]; then
            error "Frontend not built. Run with --frontend first, or without flags for full build."
            exit 1
        fi
        build_tauri
        ;;
    --check)
        run_checks
        ;;
    --help|-h)
        echo "Usage: ./scripts/build.sh [OPTION]"
        echo ""
        echo "Options:"
        echo "  (no option)   Full build: typecheck + frontend + Tauri app"
        echo "  --frontend    Build frontend only (Vite)"
        echo "  --tauri       Build Tauri app only (requires frontend built first)"
        echo "  --check       Run all quality checks (typecheck + lint + test)"
        echo "  --help        Show this help message"
        ;;
    *)
        build_full
        ;;
esac
