# FileArk

> A personal project document archive — desktop app to corral your scattered files into organized projects.

[English](./README.md) · [简体中文](./README.zh-CN.md)

FileArk is a cross-platform desktop application (Windows / macOS / Linux) for organizing personal project documents. Drop scattered files into the inbox, get smart project & category recommendations, and keep everything in one searchable place. Built with Tauri 2 + React 18 + TypeScript — small binary, native file system, no cloud dependency.

## Highlights

- **Per-project categories** — each project has its own category list (`01_Requirements`, `02_Design`…), kept in sync with disk folders by a file watcher.
- **Spotlight-style global search (Ctrl/Cmd + K)** — fuzzy match across projects, files, and notes powered by Fuse.js + recursive file walker.
- **Inbox triage** — drop random files in, get recommended project/category, batch organize.
- **Browser-style history navigation** — back/forward across views, projects, categories, and notes (mouse side buttons & `Alt+←/→`).
- **20+ file previews** — PDF, image (zoom & pan), video/audio, code (syntax highlighting), Excel (multi-sheet), Word, Markdown, EPUB, and more.
- **Markdown / Block notes** — built-in BlockNote 0.50 editor with outline, code blocks, math, mermaid diagrams.
- **Multi-workspace** — switch / create / rename / delete isolated workspaces.
- **File watcher** — `notify` crate watches the workspace root; UI auto-refreshes on external changes.
- **Drag & drop** — OS files into any category or sub-folder; in-app file move with spring-loaded category switching.
- **Light / Dark + 4 accent colors** — Apple-style theming via CSS variables.
- **i18n** — Simplified Chinese / English UI.

## Screenshots

> _Coming soon — add `docs/screenshots/*.png` and reference them here._

## Quick Start

```bash
# install deps
pnpm install

# desktop dev (Rust + React, hot reload)
pnpm run tauri:dev

# pure frontend dev
pnpm run dev

# production build (NSIS installer on Windows)
pnpm run tauri:build
```

Requires **Node 20+**, **pnpm 10+**, **Rust 1.75+**, and the platform-specific Tauri prerequisites:

- Windows — WebView2 runtime (pre-installed on Win 10/11) + Visual Studio C++ build tools
- macOS — Xcode command line tools
- Linux — `webkit2gtk`, `libssl-dev`, `gcc`, etc. (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

## Tech Stack

| Layer | Stack |
|---|---|
| Desktop runtime | Tauri 2 (Rust backend, WebView2/WKWebView/WebKitGTK frontend) |
| UI | React 18 + TypeScript + Vite 5 |
| Styling | CSS Variables (light/dark + 4 accent colors), Lucide icons |
| Editor | BlockNote 0.50 (Mantine) — block-style markdown |
| Search | Fuse.js (fuzzy frontend matching) + Rust recursive walker |
| File watcher | `notify` crate (Windows: ReadDirectoryChangesW; macOS: FSEvents) |
| Drag & drop | dnd-kit (in-app) + Tauri webview drag event (OS files) |
| Preview deps | pdf.js, mammoth (Word), xlsx, react-markdown + remark-gfm, mermaid, KaTeX, highlight.js |
| Tests | Vitest + Testing Library |
| Lint | ESLint + Prettier |

## Project Structure

```
src/                      # React frontend
├── App.tsx               # Root: routing, dialogs, shortcuts, nav history
├── api.ts                # Tauri invoke wrappers (ArchiveApi)
├── types.ts              # TypeScript types shared with Rust models
├── styles.css            # Global CSS variables + theme
├── components/
│   ├── SpotlightSearch.tsx
│   ├── projects/ProjectsView.tsx
│   └── notes/NoteEditor.tsx
├── views/                # Home / Inbox / Settings / Trash / Notes
├── dialogs/              # PreviewModal, NewProjectDialog, …
└── utils/

src-tauri/                # Rust backend
├── Cargo.toml
└── src/
    ├── main.rs           # All Tauri commands + file watcher
    ├── store.rs          # JSON persistence + inbox recommendation
    ├── models.rs         # Shared Rust ↔ TypeScript models
    └── utils.rs
```

## Data & Storage

All data is local — no telemetry, no cloud.

| What | Where |
|---|---|
| Workspace files | User-chosen folder (e.g. `E:\workspace\doc`) |
| Workspace registry | `%APPDATA%\com.fileark.app\registry.json` (Windows) / `~/Library/Application Support/com.fileark.app/` (macOS) / `~/.local/share/com.fileark.app/` (Linux) |
| Per-workspace data | `workspace-{uuid}.json` next to the registry |
| Trashed files | `trashed_files-{workspaceId}/` (30-day auto cleanup) |
| Notes | `{workspaceRoot}/notes/` |

## Scripts

```bash
pnpm run typecheck    # TypeScript noEmit
pnpm run lint         # ESLint
pnpm run format       # Prettier write
pnpm run test         # Vitest
pnpm run check        # typecheck + lint + format:check + test
```

## Roadmap

- [ ] App icon & screenshots
- [ ] macOS / Linux release builds (CI)
- [ ] Tag-based filtering on Home
- [ ] Saved searches
- [ ] Optional encrypted vault for sensitive folders

## Contributing

Issues and PRs are welcome. Please run `pnpm run check` before submitting.

## License

MIT © tangxiaobing
