# =============================================================================
# FileArk - Production Build Script (Windows PowerShell)
# =============================================================================
# Usage:
#   .\scripts\build.ps1                # Full build (typecheck + frontend + tauri)
#   .\scripts\build.ps1 -Frontend      # Frontend only
#   .\scripts\build.ps1 -Tauri         # Tauri app only (assumes frontend built)
#   .\scripts\build.ps1 -Check         # Run all checks (typecheck + lint + test)
#   .\scripts\build.ps1 -Help          # Show help
# =============================================================================

param(
    [switch]$Frontend,
    [switch]$Tauri,
    [switch]$Check,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Step = 0

function Write-Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Step-Header($num, $total, $title) {
    Write-Host ""
    Write-Info "Step ${num}/${total}: $title"
    Write-Host "----------------------------------------"
}

# --- Pre-flight Checks -------------------------------------------------------

function Check-Prerequisites {
    $script:missing = $false

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Err "Node.js is not installed"
        $script:missing = $true
    }

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Err "Rust/Cargo is not installed"
        $script:missing = $true
    }

    if ($script:missing) { exit 1 }
}

# --- Install Dependencies -----------------------------------------------------

function Install-Deps {
    if (-not (Test-Path "$ProjectRoot\node_modules")) {
        Write-Info "Installing dependencies..."
        Set-Location $ProjectRoot
        if (Test-Path "$ProjectRoot\pnpm-lock.yaml") {
            pnpm install
        } else {
            npm install
        }
        Write-Ok "Dependencies installed"
    }
}

# --- Type Check ---------------------------------------------------------------

function Run-TypeCheck {
    Write-Info "Running TypeScript type check..."
    Set-Location $ProjectRoot
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Type check failed!"
        exit 1
    }
    Write-Ok "Type check passed"
}

# --- Lint ---------------------------------------------------------------------

function Run-Lint {
    Write-Info "Running ESLint..."
    Set-Location $ProjectRoot
    npx eslint src --max-warnings=0
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Lint check failed!"
        exit 1
    }
    Write-Ok "Lint check passed"
}

# --- Test ---------------------------------------------------------------------

function Run-Tests {
    Write-Info "Running tests..."
    Set-Location $ProjectRoot
    npx vitest run
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Tests failed!"
        exit 1
    }
    Write-Ok "All tests passed"
}

# --- Frontend Build -----------------------------------------------------------

function Build-Frontend {
    Write-Info "Building frontend (Vite)..."
    Set-Location $ProjectRoot
    npx vite build
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Frontend build failed!"
        exit 1
    }
    Write-Ok "Frontend built -> dist\"
}

# --- Tauri Build --------------------------------------------------------------

function Build-Tauri {
    Write-Info "Building Tauri application..."
    Set-Location $ProjectRoot
    npx tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Tauri build failed!"
        exit 1
    }
    Write-Ok "Tauri app built -> src-tauri\target\release\bundle\"
}

# --- Help ---------------------------------------------------------------------

if ($Help) {
    Write-Host "Usage: .\scripts\build.ps1 [OPTION]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  (no flag)     Full build: typecheck + frontend + Tauri app"
    Write-Host "  -Frontend    Build frontend only (Vite)"
    Write-Host "  -Tauri       Build Tauri app only (requires frontend built first)"
    Write-Host "  -Check       Run all quality checks (typecheck + lint + test)"
    Write-Host "  -Help        Show this help message"
    exit 0
}

# --- Main ---------------------------------------------------------------------

if ($Frontend) {
    Check-Prerequisites
    Install-Deps
    Run-TypeCheck
    Build-Frontend
}
elseif ($Tauri) {
    Check-Prerequisites
    if (-not (Test-Path "$ProjectRoot\dist")) {
        Write-Err "Frontend not built. Run with -Frontend first, or without flags for full build."
        exit 1
    }
    Build-Tauri
}
elseif ($Check) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor White
    Write-Host "   FileArk Code Quality Checks" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor White

    Check-Prerequisites
    Install-Deps

    Step-Header 1 3 "TypeScript type check"
    Run-TypeCheck

    Step-Header 2 3 "ESLint check"
    Run-Lint

    Step-Header 3 3 "Unit tests"
    Run-Tests

    Write-Host ""
    Write-Ok "All checks passed!"
}
else {
    # Full build
    Write-Host ""
    Write-Host "========================================" -ForegroundColor White
    Write-Host "   FileArk Production Build" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor White

    Check-Prerequisites
    Install-Deps

    Step-Header 1 4 "TypeScript type check"
    Run-TypeCheck

    Step-Header 2 4 "Frontend build (Vite)"
    Build-Frontend

    Step-Header 3 4 "Tauri application build"
    Build-Tauri

    Step-Header 4 4 "Build summary"
    Write-Host ""
    Write-Ok "Build completed successfully!"
    Write-Host ""

    # Show output location
    $bundleDir = "$ProjectRoot\src-tauri\target\release\bundle"
    if (Test-Path $bundleDir) {
        Write-Info "Installer location:"
        Get-ChildItem -Path $bundleDir -Recurse -Include "*.exe","*.msi" | ForEach-Object {
            Write-Host "  $($_.FullName)"
        }
    }

    if (Test-Path "$ProjectRoot\dist") {
        $size = (Get-ChildItem "$ProjectRoot\dist" -Recurse | Measure-Object -Property Length -Sum).Sum
        $sizeMB = [math]::Round($size / 1MB, 2)
        Write-Info "Frontend output: dist\ ($sizeMB MB)"
    }
}
