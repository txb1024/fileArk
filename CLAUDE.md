# FileArk — 个人项目资料库

## 技术栈
- **前端**: React 18 + TypeScript + Vite 5
- **桌面框架**: Tauri 2 (Rust backend)
- **样式**: CSS Variables 主题系统 (light/dark + 4 accent colors), Lucide React icons
- **包管理**: pnpm
- **测试**: Vitest + Testing Library
- **代码质量**: ESLint + Prettier
- **预览依赖**: highlight.js (代码), react-markdown + remark-gfm (Markdown), mammoth (Word), xlsx (Excel)

## 启动
```bash
pnpm run tauri:dev    # 桌面开发 (Rust + React)
pnpm run dev           # 纯前端开发
pnpm run typecheck     # TypeScript 类型检查
pnpm run check         # 全部检查 (typecheck + lint + format + test)
```

## 项目结构
```
E:\codex\
├── src/                      # React 前端
│   ├── App.tsx               # 主组件：路由、状态、对话框、快捷键
│   ├── api.ts                # Tauri invoke 调用封装 (ArchiveApi)
│   ├── types.ts              # TypeScript 类型定义
│   ├── styles.css            # 全局样式 (2700+ 行, CSS变量主题)
│   ├── main.tsx              # 入口
│   ├── components/           # 通用组件
│   │   ├── SpotlightSearch.tsx  # Ctrl+K 全局搜索
│   │   ├── projects/ProjectsView.tsx  # 项目详情页（文件浏览）
│   │   ├── EmptyState.tsx    # 空状态
│   │   ├── Metric.tsx        # 指标卡
│   │   ├── Modal.tsx         # 通用弹窗
│   │   ├── Panel.tsx         # 面板容器
│   │   ├── ProjectCard.tsx   # 项目卡片
│   │   └── ResultSection.tsx # 搜索结果分组
│   ├── views/                # 页面视图
│   │   ├── HomeView.tsx      # 首页
│   │   ├── InboxView.tsx     # 收件箱
│   │   ├── SettingsView.tsx  # 设置 (Apple风格)
│   │   └── TrashView.tsx     # 回收站
│   ├── dialogs/              # 对话框
│   │   ├── PreviewModal.tsx  # 文件预览 (PDF/图片/视频/音频/代码/Excel/Word/Markdown)
│   │   ├── NewProjectDialog.tsx
│   │   ├── ConfirmDangerDialog.tsx
│   │   └── ...
│   └── utils/                # 工具函数
│       └── fileIcon.tsx      # getFileIcon(): 按扩展名返回彩色图标 (40+类型)
├── src-tauri/                # Rust 后端
│   ├── Cargo.toml            # 依赖: notify, serde, uuid, open, regex, base64
│   └── src/
│       ├── main.rs           # Tauri commands + 文件监视器 (notify crate)
│       ├── store.rs          # JSON 数据存储 + 收件箱推理引擎 (infer_project/infer_category)
│       ├── models.rs         # 共享数据模型 (Rust ↔ JSON ↔ TypeScript)
│       └── utils.rs          # Rust 工具函数
├── docs/                     # 设计文档
└── scripts/                  # 辅助脚本
```

## 数据模型
- **Project**: id, name, alias, tags[], path, pinned, createdAt, updatedAt, lastOpenedAt, recentFiles[]
- **InboxItem**: id, name, sourcePath, size, modifiedAt, recommendedProjectId, recommendedCategory, status
- **CategoryFile**: name, path, isDirectory, size, modifiedAt, children?[]
- **AppData**: projects[], inbox[], activities[], settings{workspaceRoot, categories[]}
- **WorkspaceRegistry**: activeWorkspaceId, workspaces[]

## 核心功能
1. **项目管理**: 创建项目、自动生成分类文件夹、置顶、别名/标签
2. **收件箱**: 导入零散文件 → 智能推荐项目/分类 → 批量归类
3. **文件浏览**: 分类侧栏、列表/网格视图、文件夹展开/折叠、拖放添加、右键菜单、可预览20+类型
4. **全局搜索 (Ctrl+K)**: Spotlight风格，前端同步搜项目/收件箱 + 后端异步搜磁盘文件
5. **文件监视**: notify crate 监听工作目录 → debounce 300ms → Tauri event → 前端自动刷新
6. **多工作空间**: 切换/创建/重命名/删除资料库 (JSON文件隔离)
7. **设置**: 工作目录、分类管理、语言(zh/en)、主题(light/dark)、强调色(teal/blue/violet/orange)
8. **文件预览**: PDF/图片(缩放+拖拽)/视频/音频/代码(行号+语法高亮)/Excel(多sheet+A,B,C列标题)/Word(暗色主题)/Markdown(代码高亮)

## 设计系统
- CSS变量: --bg, --surface, --surface-soft, --text, --muted, --border, --accent, --accent-strong, --accent-soft, --accent-on, --sidebar, --sidebar-hover
- 主题切换: `.app-shell.theme-dark` / `.app-shell.accent-{blue|violet|orange}`
- 圆角: 8px(小)/10px(卡片)/12px(面板/弹窗)/14px(Spotlight)
- 阴影分层: 去掉了大部分 border，用 box-shadow 区分层级
- 按钮: .primary (accent填充) / .secondary (边框) / .danger (红色)
- Typography: Apple HIG 10级 (text-large-title ~ text-caption-2)

## 跨平台注意事项
- 路径分隔符: Windows `\` vs macOS/Linux `/`，Rust端注意使用 `std::path::Path`
- notify crate: v6 默认 features，Windows用ReadDirectoryChangesWatcher，macOS用FSEvents
- 命令行: 开发时在 bash (Git Bash) 中运行，路径用 `/e/codex` 格式

## 常用 Rust 命令注册名 (invoke)
get_data, select_root, select_files, create_project, toggle_pin, mark_project_opened, update_root, check_root_files, migrate_root, add_inbox_files, organize_inbox, delete_inbox_items, clear_inbox, add_files_to_category, create_category_folder, list_category_files_cmd, get_category_counts, open_file, open_folder, list_workspaces, create_workspace, switch_workspace, rename_workspace, delete_workspace, get_autostart_enabled, set_autostart_enabled, update_categories, get_trash_items, delete_project, restore_project, permanently_delete_trash_item, empty_trash, send_notification, read_file_content, read_file_binary, get_preview_info, delete_file, copy_file_to, move_file_to, read_clipboard_files, start_watching, stop_watching, search_project_files
