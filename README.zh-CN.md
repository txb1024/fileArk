# FileArk

> 个人项目资料库 —— 把零散的项目文件归到一个地方，集中检索的桌面工具。

[English](./README.md) · [简体中文](./README.zh-CN.md)

FileArk 是一个跨平台桌面应用（Windows / macOS / Linux），专为个人项目资料管理设计。把零散文件拖进收件箱，自动获得项目和分类的智能推荐，所有资料集中在一处搜索。基于 Tauri 2 + React 18 + TypeScript 构建——体积小、原生文件系统、不依赖云服务。

## 主要功能

- **项目级独立分类** —— 每个项目有自己的分类列表（`01_需求`、`02_技術方案`……），文件监视器实时与磁盘文件夹双向同步。
- **Spotlight 全局搜索 (Ctrl/Cmd + K)** —— 跨项目、文件、便签的模糊匹配，由 Fuse.js + Rust 递归 walker 驱动。
- **收件箱归档** —— 散落文件先丢进来，得到项目/分类的智能推荐，批量整理。
- **浏览器式前进/后退导航** —— 视图、项目、分类、便签都能前进后退，支持鼠标侧键和 `Alt+←/→`。
- **20+ 文件预览** —— PDF、图片（缩放 + 拖拽）、视频/音频、代码（语法高亮）、Excel（多 sheet）、Word、Markdown、EPUB 等。
- **Markdown / 块状便签** —— 内置 BlockNote 0.50 编辑器，含大纲、代码块、数学公式、mermaid 流程图。
- **多工作空间** —— 切换/新建/重命名/删除独立工作空间。
- **文件监视** —— `notify` crate 监听工作目录，外部增删/重命名自动反映到界面。
- **拖放支持** —— 系统文件直接拖到任意分类或子文件夹；应用内拖动文件，悬停侧栏分类自动切换。
- **浅色 / 深色 + 4 种强调色** —— 基于 CSS 变量的 Apple 风格主题。
- **国际化** —— 简体中文 / 英文界面切换。

## 截图

> _即将补充——在 `docs/screenshots/*.png` 添加截图后在此引用。_

## 快速开始

```bash
# 安装依赖
pnpm install

# 桌面端开发（Rust + React，热重载）
pnpm run tauri:dev

# 纯前端开发
pnpm run dev

# 生产构建（Windows 产出 NSIS 安装包）
pnpm run tauri:build
```

需要 **Node 20+**、**pnpm 10+**、**Rust 1.75+**，以及对应平台的 Tauri 依赖：

- Windows —— WebView2 运行时（Win 10/11 预装）+ Visual Studio C++ 构建工具
- macOS —— Xcode command line tools
- Linux —— `webkit2gtk`、`libssl-dev`、`gcc` 等（参见 [Tauri 环境要求](https://tauri.app/start/prerequisites/)）

## 技术栈

| 分层 | 技术 |
|---|---|
| 桌面运行时 | Tauri 2（Rust 后端 + WebView2/WKWebView/WebKitGTK 前端） |
| UI 框架 | React 18 + TypeScript + Vite 5 |
| 样式 | CSS 变量（浅/深 + 4 强调色）、Lucide 图标 |
| 编辑器 | BlockNote 0.50（Mantine）——块状 Markdown |
| 搜索 | Fuse.js（前端模糊匹配）+ Rust 递归 walker |
| 文件监视 | `notify` crate（Windows: ReadDirectoryChangesW；macOS: FSEvents） |
| 拖放 | dnd-kit（应用内）+ Tauri webview drag event（系统文件） |
| 预览依赖 | pdf.js、mammoth (Word)、xlsx、react-markdown + remark-gfm、mermaid、KaTeX、highlight.js |
| 测试 | Vitest + Testing Library |
| 代码质量 | ESLint + Prettier |

## 项目结构

```
src/                      # React 前端
├── App.tsx               # 入口:路由、对话框、快捷键、导航历史
├── api.ts                # Tauri invoke 封装(ArchiveApi)
├── types.ts              # 与 Rust 模型共享的 TS 类型
├── styles.css            # 全局 CSS 变量 + 主题
├── components/
│   ├── SpotlightSearch.tsx
│   ├── projects/ProjectsView.tsx
│   └── notes/NoteEditor.tsx
├── views/                # Home / Inbox / Settings / Trash / Notes
├── dialogs/              # PreviewModal、NewProjectDialog 等
└── utils/

src-tauri/                # Rust 后端
├── Cargo.toml
└── src/
    ├── main.rs           # 所有 Tauri commands + 文件监视器
    ├── store.rs          # JSON 持久化 + 收件箱推理
    ├── models.rs         # Rust ↔ TypeScript 共享数据模型
    └── utils.rs
```

## 数据与存储

所有数据本地存储——无遥测，无云服务。

| 内容 | 位置 |
|---|---|
| 工作空间文件 | 用户自选目录（如 `E:\workspace\doc`） |
| 工作空间注册表 | `%APPDATA%\com.fileark.app\registry.json`（Windows） / `~/Library/Application Support/com.fileark.app/`（macOS） / `~/.local/share/com.fileark.app/`（Linux） |
| 每工作空间数据 | `workspace-{uuid}.json`（与注册表同目录） |
| 回收站文件 | `trashed_files-{workspaceId}/`（30 天自动清理） |
| 便签 | `{workspaceRoot}/notes/` |

## 常用命令

```bash
pnpm run typecheck    # TypeScript 类型检查
pnpm run lint         # ESLint
pnpm run format       # Prettier 格式化
pnpm run test         # Vitest
pnpm run check        # 全部检查（typecheck + lint + format:check + test）
```

## Roadmap

- [ ] 应用图标 + 截图
- [ ] macOS / Linux 发布构建（CI）
- [ ] 首页按标签筛选
- [ ] 保存搜索条件
- [ ] 敏感目录可选加密保险箱

## 贡献

欢迎 issue 和 PR。提交前请运行 `pnpm run check`。

## 许可证

MIT © tangxiaobing
