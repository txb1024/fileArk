# =============================================================================
# FileArk - Development Environment Startup Script (Windows PowerShell)
# =============================================================================
# Usage:
#   .\scripts\dev.ps1              # Start full dev environment
#   .\scripts\dev.ps1 -Help        # Show help
# =============================================================================

param(
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Write-Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERROR] $msg" -ForegroundColor Red }

if ($Help) {
    Write-Host "Usage: .\scripts\dev.ps1"
    Write-Host ""
    Write-Host "Start the FileArk development environment."
    Write-Host "This runs 'tauri dev' which starts both the Vite frontend"
    Write-Host "dev server and the Rust backend."
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor White
Write-Host "   FileArk Development Environment" -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
Write-Host ""

# Pre-flight checks
$missing = $false

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js is not installed. Install from https://nodejs.org"
    $missing = $true
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Err "Rust/Cargo is not installed. Install from https://rustup.rs"
    $missing = $true
}

if ($missing) { exit 1 }
Write-Ok "All prerequisites satisfied"

# Install dependencies
if (-not (Test-Path "$ProjectRoot\node_modules")) {
    Write-Info "Installing frontend dependencies..."
    Set-Location $ProjectRoot
    if (Test-Path "$ProjectRoot\pnpm-lock.yaml") {
        pnpm install
    } else {
        npm install
    }
    Write-Ok "Dependencies installed"
}

# Start dev
Write-Host ""
Write-Info "Starting Tauri dev server (frontend + backend)..."
Write-Info "Frontend: http://127.0.0.1:5173"
Write-Info "Press Ctrl+C to stop"
Write-Host ""

Set-Location $ProjectRoot
npx tauri dev
