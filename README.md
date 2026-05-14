# FileArk (FA)

Personal Project Document Archive — A desktop application for organizing and managing project files.

## Project Structure

```
fileark/
├── src/                      # Frontend source (React + TypeScript + Vite)
│   ├── components/           # Reusable UI components
│   │   └── projects/        # Project-specific components
│   ├── dialogs/             # Modal dialogs
│   ├── hooks/               # Custom React hooks
│   ├── views/               # Page-level views
│   ├── utils/               # Utility functions
│   ├── test/                # Test setup & helpers
│   ├── api.ts               # Tauri API adapter layer
│   ├── types.ts             # TypeScript type definitions
│   ├── styles.css           # Global styles
│   ├── App.tsx              # Root application component
│   └── main.tsx             # React entry point
├── src-tauri/                # Backend source (Rust + Tauri v2)
│   ├── src/                  # Rust source code
│   │   ├── main.rs           # Application entry & command handlers
│   │   ├── models.rs         # Data models & types
│   │   ├── store.rs          # Data persistence layer
│   │   └── utils.rs          # Utility functions
│   ├── icons/               # App icons
│   ├── Cargo.toml            # Rust dependencies
│   ├── build.rs              # Tauri build script
│   └── tauri.conf.json       # Tauri configuration
├── scripts/                  # Automation scripts
│   ├── build.sh              # Build script (Bash)
│   ├── build.ps1             # Build script (PowerShell)
│   ├── dev.sh                # Dev startup (Bash)
│   └── dev.ps1               # Dev startup (PowerShell)
├── docs/                     # Documentation
├── public/                   # Static assets
├── dist/                     # Frontend build output (gitignored)
├── index.html                # Vite HTML entry
├── package.json              # Node.js dependencies & scripts
├── vite.config.ts            # Vite configuration
├── tsconfig.json             # TypeScript configuration
├── tsconfig.node.json        # TypeScript config for Node tooling
├── eslint.config.mjs         # ESLint configuration
├── .prettierrc               # Prettier configuration
└── .gitignore                # Git ignore rules
```

## Quick Start

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **Rust** 1.70+ ([install via rustup](https://rustup.rs))
- **pnpm** (recommended) or npm

### Development

```bash
# Install dependencies
pnpm install

# Start dev environment (frontend + backend)
pnpm tauri:dev

# Or use the automation script
# Windows:
.\scripts\dev.ps1
# macOS/Linux:
./scripts/dev.sh
```

The frontend dev server runs at `http://127.0.0.1:5173`.

### Build

```bash
# Full production build (typecheck + frontend + Tauri)
pnpm tauri:build

# Or step by step:
pnpm build           # Frontend only
pnpm tauri:build     # Tauri app (includes frontend)

# Or use the automation script
# Windows:
.\scripts\build.ps1
# macOS/Linux:
./scripts/build.sh

# Build options:
.\scripts\build.ps1 -Frontend    # Frontend only
.\scripts\build.ps1 -Tauri       # Tauri only (requires frontend built)
.\scripts\build.ps1 -Check       # Run quality checks only
```

Build output: `src-tauri/target/release/bundle/`

### Quality Checks

```bash
pnpm typecheck       # TypeScript type checking
pnpm lint            # ESLint
pnpm lint:fix        # ESLint with auto-fix
pnpm format:check    # Prettier format check
pnpm format          # Prettier format
pnpm test            # Run unit tests
pnpm test:watch      # Run tests in watch mode
pnpm check           # Run all checks at once
```

## Tech Stack

| Layer      | Technology                                        |
|------------|---------------------------------------------------|
| Frontend   | React 18, TypeScript, Vite 5, lucide-react        |
| Backend    | Rust, Tauri v2                                    |
| Plugins    | Dialog, FS, Shell, Autostart, Global Shortcut, Notification, Clipboard |
| Tooling    | ESLint, Prettier, Vitest                         |

## Features

- File organization by projects and categories
- Drag & drop file import
- System tray integration
- Clipboard paste support
- Auto-start with system
- Search and preview files
- Multi-workspace support
- Dark/light theme toggle
- i18n (Chinese/English)
- Trash with soft delete & permanent delete
- Category sidebar collapse
