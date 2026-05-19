import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  Home,
  Menu,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings,
  Sparkles,
  Star,
  Trash2,
  X,
  Eye,
  Download,
  Copy,
  LayoutList,
  LayoutGrid,
  StickyNote,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import type { AppData, CategoryFile, Project, WorkspaceRegistry } from "./types";
import { HomeView, TrashView, InboxView, SettingsView, NotesView } from "./views";
import { ProjectsView } from "./components/projects/ProjectsView";
import { SpotlightSearch } from "./components/SpotlightSearch";
import { ContextMenu, type ContextMenuItem } from "./components/notes/ContextMenu";
import {
  ConfirmDeleteDialog,
  NewProjectDialog,
  RenameWorkspaceDialog,
  RenameProjectDialog,
  MigrateRootDialog,
  CategoryEditModal,
  PreviewModal,
  ConfirmDangerDialog,
  BootstrapDialog,
} from "./dialogs";
import { storage } from "./utils";

// ── 類型定義 ──────────────────────────────────────────────

type View = "home" | "projects" | "inbox" | "search" | "settings" | "trash" | "category-edit" | "notes";
type Language = "zh" | "en";
type ThemeMode = "light" | "dark";
type AccentColor = "blue" | "teal" | "violet" | "orange";
type SortMode = "name" | "time" | "size";
type SortDirection = "asc" | "desc";
type FileScale = "compact" | "comfortable" | "large";
type FileViewMode = "list" | "grid";

type DialogState =
  | { type: "none" }
  | { type: "rename-workspace"; workspaceId: string; currentName: string }
  | { type: "delete-workspace"; workspaceId: string; name: string }
  | { type: "rename-project"; projectId: string; currentName: string }
  | { type: "delete-project"; projectId: string; name: string }
  | { type: "migrate-root"; oldRoot: string; newRoot: string; fileCount: number };

// ── 翻譯 ──────────────────────────────────────────────────

const messages = {
  zh: {
    appName: "个人项目资料库",
    home: "首页",
    projects: "项目",
    inbox: "收件箱",
    search: "搜索",
    settings: "设置",
    projectList: "项目列表",
    pinned: "置顶",
    unpinned: "取消置顶",
    rename: "重命名",
    deleteAction: "删除",
    openProjectFolder: "打开项目根目录",
    openContainingFolder: "打开文件所在目录",
    searchPlaceholder: "搜索项目、别名、标签、文件  Ctrl+K",
    importFiles: "导入文件",
    newProject: "新建项目",
    categories: "分类",
    filterByName: "按文件名称筛选",
    openCategoryFolder: "打开分类文件夹",
    addFiles: "加入文件",
    newFolder: "新建目录",
    addCategory: "新建分类",
    deleteCategory: "删除分类",
    renameCategory: "重命名",
    renameCategoryDuplicate: "已存在同名分类「{name}」,请换一个名字。",
    addCategoryPlaceholder: "输入新分类名…",
    deleteCategoryConfirm: "确定从全局分类列表中删除「{name}」？磁盘上的文件夹和文件不会被删除。",
    sortByName: "按名称",
    sortByTime: "按时间",
    sortBySize: "按大小",
    name: "名称",
    modifiedAt: "修改时间",
    size: "大小",
    dragHint: "拖拽文件到这里，直接放入当前分类。",
    emptyCategory: "这个分类还没有文件",
    emptyCategoryBody: "可以点击加入文件，或直接把文件拖到这个区域。",
    noMatch: "没有匹配的文件",
    noMatchBody: "换一个文件名关键词再试。",
    folder: "目录",
    rootFiles: "分类根目录",
    rootDropHint: "把文件拖到这里放入此分类根目录",
    folderNamePrompt: "请输入新目录名称",
    deleteFile: "删除",
    copyFile: "复制",
    pasteFile: "粘贴",
    openFile: "打开",
    previewFile: "预览",
    pasteTo: "粘贴到",
    confirmDelete: "确定要删除此文件吗？",
    expand: "展开",
    collapse: "收起",
    language: "语言",
    theme: "主题",
    accent: "主题色",
    light: "日间",
    dark: "夜间",
    scale: "缩放",
    noRootWarning: "尚未设置工作目录，请先前往设置页面配置，再新建项目。",
    goToSettings: "前往设置",
    migrateTitle: "迁移工作目录",
    migrateBody: "原目录中有 {count} 个文件/文件夹，是否迁移到新目录？",
    migrateConfirm: "迁移并删除原目录",
    migrateSkip: "仅切换目录",
    migrateCancel: "取消",
    autostart: "开机启动",
    autostartDesc: "登录 Windows 时自动启动应用",
    trash: "回收站",
    emptyTrash: "清空回收站",
    emptyTrashConfirm: "确定要清空回收站吗？此操作不可恢复。",
    restoreProject: "恢复",
    permanentlyDelete: "永久删除",
    trashEmpty: "回收站是空的",
    trashEmptyBody: "删除的项目会出现在这里",
    deletedAt: "删除时间",
    workspaceSwitch: "切换资料库",
    newDatabase: "新建资料库",
    databaseNamePlaceholder: "输入资料库名称",
    confirm: "确认",
    deleteFileConfirm: "删除后文件会移入回收站，保留 30 天后自动永久删除。",
    // HomeView
    heroEyebrow: "项目入口管理器",
    heroTitle: "不用再一层层点文件夹。",
    heroBody: "用项目、别名、标签和最近访问，把零散资料快速归位并找回来。",
    metricProjectCount: "项目数量",
    metricInboxCount: "待整理文件",
    metricPinnedCount: "置顶项目",
    metricWorkspaceRoot: "工作目录",
    metricRootNotSet: "未设置",
    recentProjects: "最近项目",
    recentActivity: "最近操作",
    emptyProjectTitle: "还没有项目",
    emptyProjectBody: "先新建一个项目，软件会自动建立标准分类文件夹。",
    emptyActivityTitle: "暂无操作记录",
    emptyActivityBody: "新建项目、导入文件和归类文件后会显示在这里。",
    importToInbox: "加入收件箱",
    // InboxView
    inboxEyebrow: "临时入口",
    inboxTitle: "收件箱",
    inboxBody: "先把散落文件放进来，再批量归入项目和分类。",
    organizeSelected: "归类已选",
    deleteSelected: "删除已选",
    clearAll: "清空全部",
    applyRecommend: "套用推荐",
    noMatchProject: "未匹配项目",
    inboxEmptyTitle: "收件箱是空的",
    inboxEmptyBody: "导入桌面、下载或聊天软件中的文件后，可以在这里批量整理。",
    removeFromInbox: "从收件箱移除",
    // SearchView
    searchEyebrow: "快速入口",
    searchTitle: "全局搜索",
    searchBody: "按项目名、简称、标签或文件名搜索，不需要记住文件夹路径。",
    searchPlaceholderLarge: "例如：支付、HIS、退款、接口、功能书",
    searchStartTitle: "输入关键词开始搜索",
    searchStartBody: "建议给项目设置别名和标签，搜索会更接近你的记忆方式。",
    searchProjects: "项目",
    searchRecentFiles: "最近文件",
    searchInbox: "收件箱",
    // SettingsView
    settingsTitle: "设置",
    settingsBody: "所有资料都保存在本机，项目文件夹由你指定。",
    appearance: "外观",
    themeLabel: "主题",
    accentLabel: "强调色",
    general: "通用",
    storage: "存储",
    workspaceRoot: "工作目录",
    workspaceRootDesc: "新建项目时，会在这个目录下生成项目文件夹。",
    workspaceRootNotSet: "未设置",
    changeRoot: "更换",
    repairPaths: "修复项目路径",
    repairPathsDesc: "若之前迁移过工作目录但项目卡片打不开,点这里按项目名在当前目录下重新定位。",
    repairPathsResult: "已修复 {count} 个项目路径。",
    repairPathsNone: "没有需要修复的项目。",
    repairWorkspaces: "分离工作空间目录",
    repairWorkspacesDesc: "把还共用默认根目录的工作空间自动改成 默认根/工作空间名 子目录,并把已有项目目录整体搬过去。",
    repairWorkspacesResult: "已分离 {wsCount} 个工作空间,迁移 {fileCount} 个项目目录。",
    repairWorkspacesNone: "没有需要分离的工作空间。",
    noteAssets: "便签附件目录",
    noteAssetsDesc: "便签中的图片、文件等附件保存位置。留空则使用默认 {workspaceRoot}/notes/assets。",
    noteAssetsDefault: "默认（工作目录下 notes/assets）",
    changeNoteAssets: "选择目录",
    resetNoteAssets: "恢复默认",
    categoryManagement: "分类",
    editCategory: "编辑",
    database: "数据库",
    currentDatabase: "当前",
    switchDatabase: "切换",
    renameDatabase: "重命名",
    deleteDatabase: "删除",
  },
  en: {
    appName: "Project Archive",
    home: "Home",
    projects: "Projects",
    inbox: "Inbox",
    search: "Search",
    settings: "Settings",
    projectList: "Project List",
    pinned: "Pinned",
    unpinned: "Unpin",
    rename: "Rename",
    deleteAction: "Delete",
    openProjectFolder: "Open project folder",
    openContainingFolder: "Open containing folder",
    searchPlaceholder: "Search projects, aliases, tags, files  Ctrl+K",
    importFiles: "Import",
    newProject: "New Project",
    categories: "Categories",
    filterByName: "Filter by file name",
    openCategoryFolder: "Open category folder",
    addFiles: "Add Files",
    newFolder: "New Folder",
    addCategory: "New category",
    deleteCategory: "Delete category",
    renameCategory: "Rename",
    renameCategoryDuplicate: "Category \"{name}\" already exists. Pick a different name.",
    addCategoryPlaceholder: "Category name…",
    deleteCategoryConfirm: "Remove \"{name}\" from the global category list? Files and folders on disk are kept.",
    sortByName: "Name",
    sortByTime: "Time",
    sortBySize: "Size",
    name: "Name",
    modifiedAt: "Modified",
    size: "Size",
    dragHint: "Drop files here to add them to this category.",
    emptyCategory: "No files in this category",
    emptyCategoryBody: "Add files or drag them into this area.",
    noMatch: "No matching files",
    noMatchBody: "Try another file name keyword.",
    folder: "Folder",
    rootFiles: "Category Root",
    rootDropHint: "Drop files here to add them to this category root",
    folderNamePrompt: "Enter a new folder name",
    deleteFile: "Delete",
    copyFile: "Copy",
    pasteFile: "Paste",
    openFile: "Open",
    previewFile: "Preview",
    pasteTo: "Paste to",
    confirmDelete: "Are you sure you want to delete this file?",
    expand: "Expand",
    collapse: "Collapse",
    language: "Language",
    theme: "Theme",
    accent: "Accent",
    light: "Light",
    dark: "Dark",
    scale: "Scale",
    noRootWarning:
      "Workspace root is not set. Please configure it in Settings before creating projects.",
    goToSettings: "Go to Settings",
    migrateTitle: "Migrate Workspace",
    migrateBody: "There are {count} files/folders in the old directory. Migrate to new directory?",
    migrateConfirm: "Migrate & Delete Old",
    migrateSkip: "Switch Only",
    migrateCancel: "Cancel",
    autostart: "Auto Start",
    autostartDesc: "Start automatically when Windows logs in",
    trash: "Trash",
    emptyTrash: "Empty Trash",
    emptyTrashConfirm: "Are you sure you want to empty the trash? This action cannot be undone.",
    restoreProject: "Restore",
    permanentlyDelete: "Delete Permanently",
    trashEmpty: "Trash is empty",
    trashEmptyBody: "Deleted projects will appear here",
    deletedAt: "Deleted At",
    workspaceSwitch: "Switch Database",
    newDatabase: "New Database",
    databaseNamePlaceholder: "Enter database name",
    confirm: "Confirm",
    deleteFileConfirm: "Deleted files go to trash and will be permanently removed after 30 days.",
    // HomeView
    heroEyebrow: "Project Entry Manager",
    heroTitle: "No more clicking through folders.",
    heroBody:
      "Use projects, aliases, tags, and recent access to quickly organize and find your files.",
    metricProjectCount: "Projects",
    metricInboxCount: "Inbox items",
    metricPinnedCount: "Pinned",
    metricWorkspaceRoot: "Workspace",
    metricRootNotSet: "Not set",
    recentProjects: "Recent projects",
    recentActivity: "Recent activity",
    emptyProjectTitle: "No projects yet",
    emptyProjectBody: "Create a project and the app will set up standard category folders for you.",
    emptyActivityTitle: "No activity yet",
    emptyActivityBody: "Activities like creating projects and importing files will appear here.",
    importToInbox: "Import to Inbox",
    // InboxView
    inboxEyebrow: "Quick Drop",
    inboxTitle: "Inbox",
    inboxBody: "Drop scattered files here first, then batch-organize into projects and categories.",
    organizeSelected: "Organize",
    deleteSelected: "Delete selected",
    clearAll: "Clear all",
    applyRecommend: "Apply suggestion",
    noMatchProject: "No matching project",
    inboxEmptyTitle: "Inbox is empty",
    inboxEmptyBody:
      "Import files from your desktop, downloads, or chat apps to organize them here.",
    removeFromInbox: "Remove from inbox",
    // SearchView
    searchEyebrow: "Quick Access",
    searchTitle: "Global Search",
    searchBody:
      "Search by project name, alias, tag, or file name — no need to remember folder paths.",
    searchPlaceholderLarge: "e.g. payment, API, refund, interface, spec",
    searchStartTitle: "Type a keyword to start searching",
    searchStartBody: "Setting aliases and tags on projects helps search match your memory better.",
    searchProjects: "Projects",
    searchRecentFiles: "Recent files",
    searchInbox: "Inbox",
    // SettingsView
    settingsTitle: "Settings",
    settingsBody: "All data is stored locally. Project folders are determined by you.",
    appearance: "Appearance",
    themeLabel: "Theme",
    accentLabel: "Accent color",
    general: "General",
    storage: "Storage",
    workspaceRoot: "Workspace root",
    workspaceRootDesc: "New projects will create folders under this directory.",
    workspaceRootNotSet: "Not set",
    changeRoot: "Change",
    repairPaths: "Repair project paths",
    repairPathsDesc: "If projects fail to open after migrating workspace root, relocate them by name under the current root.",
    repairPathsResult: "Repaired {count} project path(s).",
    repairPathsNone: "No projects needed repair.",
    repairWorkspaces: "Separate workspace folders",
    repairWorkspacesDesc: "Move workspaces still sharing the default root into default-root/workspace-name subfolders, and physically move project folders too.",
    repairWorkspacesResult: "Separated {wsCount} workspace(s), migrated {fileCount} project folder(s).",
    repairWorkspacesNone: "No workspaces needed separation.",
    noteAssets: "Note assets folder",
    noteAssetsDesc: "Where images and files used in notes are stored. Leave blank for the default ({workspaceRoot}/notes/assets).",
    noteAssetsDefault: "Default ({workspaceRoot}/notes/assets)",
    changeNoteAssets: "Pick folder",
    resetNoteAssets: "Reset",
    categoryManagement: "Categories",
    editCategory: "Edit",
    database: "Database",
    currentDatabase: "Current",
    switchDatabase: "Switch",
    renameDatabase: "Rename",
    deleteDatabase: "Delete",
  },
} as const;

type Messages = typeof messages.zh;

const emptyData: AppData = {
  projects: [],
  inbox: [],
  activities: [],
  settings: {
    workspaceRoot: "",
    categories: [],
  },
};

// ── 主應用組件 ─────────────────────────────────────────────

export function App() {
  // 狀態
  const [data, setData] = useState<AppData>(emptyData);
  const [registry, setRegistry] = useState<WorkspaceRegistry | null>(null);
  // 首次启动时是否展示「设置工作目录」引导。判断条件:
  // - localStorage 没标记过(全新装 / 用户主动清过)
  // - 且当前没有任何项目(老用户已有项目就别打扰)
  // - 且 workspaceRoot 看起来是默认值(包含 Documents 或 \\个人项目资料库 这种)
  const [showBootstrap, setShowBootstrap] = useState(false);
  // 导航历史:支持前进/后退(浏览器风格)。current = history[index]。
  // entry 维度: view + projectId + category(项目内分类) + noteId(便签)。
  // 同位置不 push;replace 模式只更新当前 entry 不增加历史(用于"默认值修正")。
  type NavEntry = {
    view: View;
    projectId: string | null;
    category?: string;
    noteId?: string;
  };
  const [nav, setNav] = useState<{ history: NavEntry[]; index: number }>({
    history: [{ view: "home", projectId: null }],
    index: 0,
  });
  const current = nav.history[nav.index] ?? { view: "home" as View, projectId: null };
  const view = current.view;
  const activeProjectId = current.projectId;
  const currentCategory = current.category ?? null;
  const currentNoteId = current.noteId ?? null;
  const navigate = useCallback(
    (
      nextView: View,
      nextProjectId: string | null = null,
      extra: { category?: string; noteId?: string; replace?: boolean } = {},
    ) => {
      const { category, noteId, replace = false } = extra;
      setNav((prev) => {
        const cur = prev.history[prev.index];
        if (
          cur &&
          cur.view === nextView &&
          cur.projectId === nextProjectId &&
          cur.category === category &&
          cur.noteId === noteId
        ) {
          return prev; // 完全同位置不重复 push
        }
        // replace 模式:只在 view+pid 相同时合并到当前 entry,不增加历史
        if (
          replace &&
          cur &&
          cur.view === nextView &&
          cur.projectId === nextProjectId
        ) {
          const merged = [...prev.history];
          merged[prev.index] = { view: nextView, projectId: nextProjectId, category, noteId };
          return { ...prev, history: merged };
        }
        const newHistory = prev.history
          .slice(0, prev.index + 1)
          .concat({ view: nextView, projectId: nextProjectId, category, noteId });
        return { history: newHistory, index: newHistory.length - 1 };
      });
    },
    [],
  );
  const goBack = useCallback(
    () => setNav((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev)),
    [],
  );
  const goForward = useCallback(
    () =>
      setNav((prev) =>
        prev.index < prev.history.length - 1 ? { ...prev, index: prev.index + 1 } : prev,
      ),
    [],
  );
  const canGoBack = nav.index > 0;
  const canGoForward = nav.index < nav.history.length - 1;
  const [language, setLanguage] = useState<Language>(() =>
    storage.get("archive.language", "zh" as Language)
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    storage.get("archive.theme", "light" as ThemeMode)
  );
  const [accentColor, setAccentColor] = useState<AccentColor>(() =>
    storage.get("archive.accent", "blue" as AccentColor)
  );
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [copiedFile, setCopiedFile] = useState<{ path: string; name: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    path: string;
    name: string;
    content?: string;
    loading: boolean;
    error?: string;
    info?: { ext: string; size: number; is_image: boolean; previewType: string };
  } | null>(null);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [wsCreating, setWsCreating] = useState(false);
  const [wsNewName, setWsNewName] = useState("");
  const wsPopoverRef = useRef<HTMLDivElement | null>(null);
  const wsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [projectMenu, setProjectMenu] = useState<{
    x: number;
    y: number;
    project: Project;
  } | null>(null);
  const [selectedInbox, setSelectedInbox] = useState<string[]>([]);
  // 旧 navigatedCategory state 已被 NavEntry.category 取代

  /** Spotlight 搜索选中文件:跳转到该文件所在分类并在列表里闪烁高亮该行 */
  const [highlightFile, setHighlightFile] = useState<{ path: string; ts: number } | null>(null);
  /** Spotlight 搜索选中便签后,带 id 跳到便签视图;NotesView 监听 ts 触发选中 + 展开父目录 */
  // pendingNote 已被 NavEntry.noteId 取代;NotesView 通过 currentNoteId 同步选中态
  // 分类管理
  const [categoryEditOpen, setCategoryEditOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<{ index: number; name: string } | null>(
    null
  );
  const [categoryNewName, setCategoryNewName] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [fileChangeEpoch, setFileChangeEpoch] = useState(0);

  const t = messages[language] as Messages;

  // 初始化
  useEffect(() => {
    api.listWorkspaces().then(setRegistry);
    api.getData().then((d) => {
      setData(d);
      const seen = storage.get<boolean>("archive.bootstrapDone", false);
      if (!seen && d.projects.length === 0) {
        setShowBootstrap(true);
      }
    });
  }, []);

  // 系统窗口标题栏跟随 app 主题深浅切换(Windows 11 immersive dark mode / macOS native)
  // 与「整体风格一致」要求一致 — 浅色 app 配浅色 chrome,深色 app 配深色 chrome
  useEffect(() => {
    getCurrentWindow()
      .setTheme(themeMode === "dark" ? "dark" : "light")
      .catch(() => {});
  }, [themeMode]);

  // 文件系统监听：当 workspace_root 可用时启动，目录有变化时自动刷新
  useEffect(() => {
    const root = data.settings.workspaceRoot;
    if (!root) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      await api.startWatching(root);
      unlisten = await listen<string[]>("fs-changed", () => {
        setFileChangeEpoch((e) => e + 1);
        api
          .getData()
          .then(setData)
          .catch(() => {});
      });
    })().catch(() => {});

    return () => {
      unlisten?.();
      api.stopWatching().catch(() => {});
    };
  }, [data.settings.workspaceRoot]);

  // 保存偏好
  useEffect(() => {
    storage.set("archive.language", language);
    storage.set("archive.theme", themeMode);
    storage.set("archive.accent", accentColor);
  }, [language, themeMode, accentColor]);

  // 計算屬性
  const activeProject = data.projects.find((p) => p.id === activeProjectId);

  const sidebarProjects = useMemo(() => {
    return [...data.projects].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name, language === "zh" ? "zh-Hans" : "en", {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [data.projects, language]);

  const recentProjects = useMemo(() => {
    return [...data.projects]
      .sort(
        (a, b) =>
          new Date(b.lastOpenedAt || b.updatedAt).getTime() -
          new Date(a.lastOpenedAt || a.updatedAt).getTime()
      )
      .slice(0, 6);
  }, [data.projects]);

  // 快捷鍵
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen(true);
      }
      if (e.key === "Escape" && spotlightOpen) {
        setSpotlightOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spotlightOpen]);

  // 导航前进/后退:鼠标侧键(X1/X2) + Alt+方向键。输入框内不拦截方向键。
  useEffect(() => {
    function isEditingElement(el: EventTarget | null): boolean {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable;
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    }
    function onMouseDown(e: MouseEvent) {
      // 阻止 webview 自带的侧键导航默认行为(否则光抬起监听不到)
      if (e.button === 3 || e.button === 4) e.preventDefault();
    }
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || isEditingElement(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [goBack, goForward]);

  // 業務方法
  const openProject = useCallback(
    async (project: Project) => {
      navigate("projects", project.id);
      setData(await api.markProjectOpened(project.id));
    },
    [navigate],
  );

  const addInboxFiles = useCallback(async () => {
    const files = await api.selectFiles();
    if (files.length > 0) {
      setData(await api.addInboxFiles(files));
      navigate("inbox");
    }
  }, [navigate]);

  const organizeInbox = useCallback(
    async (projectId: string, category: string, itemIds = selectedInbox) => {
      if (!projectId || itemIds.length === 0) return;
      setData(await api.organizeInbox({ itemIds, projectId, category }));
      setSelectedInbox([]);
    },
    [selectedInbox]
  );

  const handleSwitchWorkspace = useCallback(async (workspaceId: string) => {
    setData(await api.switchWorkspace(workspaceId));
    setRegistry(await api.listWorkspaces());
    navigate("home");
    setWsDropdownOpen(false);
    setSidebarOpen(false);
  }, [navigate]);

  // 关闭工作空间弹窗时统一清理"新建"输入状态
  const closeWsDropdown = useCallback(() => {
    setWsDropdownOpen(false);
    setWsCreating(false);
    setWsNewName("");
  }, []);

  // 点击外部 / 按 ESC 关闭工作空间弹窗
  useEffect(() => {
    if (!wsDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wsPopoverRef.current?.contains(target)) return;
      if (wsTriggerRef.current?.contains(target)) return;
      closeWsDropdown();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWsDropdown();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [wsDropdownOpen, closeWsDropdown]);

  const handleCreateWorkspace = useCallback(async () => {
    if (!wsNewName.trim()) {
      setWsCreating(true);
      return;
    }
    const newRegistry = await api.createWorkspace(wsNewName.trim());
    setRegistry(newRegistry);
    setData(await api.getData());
    navigate("settings");
    setWsDropdownOpen(false);
    setWsCreating(false);
    setWsNewName("");
  }, [wsNewName, navigate]);

  const handleRenameConfirm = useCallback(async (workspaceId: string, newName: string) => {
    setRegistry(await api.renameWorkspace(workspaceId, newName.trim()));
    setDialog({ type: "none" });
  }, []);

  const handleDeleteConfirm = useCallback(async (workspaceId: string) => {
    setRegistry(await api.deleteWorkspace(workspaceId));
    setDialog({ type: "none" });
  }, []);

  // ── 项目右键菜单 ────────────────────────────────────────
  const handleProjectContextMenu = useCallback(
    (e: React.MouseEvent, project: Project) => {
      e.preventDefault();
      e.stopPropagation();
      setProjectMenu({ x: e.clientX, y: e.clientY, project });
    },
    []
  );

  const closeProjectMenu = useCallback(() => setProjectMenu(null), []);

  const handleProjectRenameConfirm = useCallback(
    async (projectId: string, newName: string) => {
      try {
        setData(await api.renameProject(projectId, newName));
        setDialog({ type: "none" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(`重命名失败：${msg}`);
      }
    },
    []
  );

  const handleProjectDeleteConfirm = useCallback(
    async (projectId: string) => {
      try {
        const next = await api.deleteProject(projectId);
        setData(next);
        if (activeProjectId === projectId) {
          navigate("home");
        }
        setDialog({ type: "none" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(`删除失败：${msg}`);
      }
    },
    [activeProjectId, navigate]
  );

  const handleMigrateRoot = useCallback(
    async (oldRoot: string, newRoot: string, migrate: boolean) => {
      try {
        setData(await api.migrateRoot({ oldRoot, newRoot, migrate }));
        setDialog({ type: "none" });
      } catch (err) {
        // 后端拒绝(如目标目录是源目录的子目录)走这里;弹原始错误文本让用户看清
        window.alert(String(err));
      }
    },
    []
  );

  // 分类管理
  function openEditCategory(index: number, name: string) {
    setCategoryEditing({ index, name });
    setCategoryNewName(name);
  }

  function openAddCategory() {
    setCategoryEditing(null);
    setCategoryNewName("");
    setCategoryEditOpen(true);
  }

  async function handleSaveCategory() {
    const newName = categoryNewName.trim();
    if (!newName) return;
    const categories = data.settings.categories;
    let newCategories: string[];
    if (categoryEditing !== null) {
      newCategories = [...categories];
      newCategories[categoryEditing.index] = newName;
    } else {
      newCategories = [...categories, newName];
    }
    const updatedData = await api.updateCategories(newCategories);
    setData(updatedData);
    // 不关闭 modal,让用户可以连续编辑/添加多个分类
    setCategoryEditing(null);
    setCategoryNewName("");
  }

  async function handleDeleteCategory(index: number) {
    const newCategories = data.settings.categories.filter((_, i) => i !== index);
    const updatedData = await api.updateCategories(newCategories);
    setData(updatedData);
  }

  const handlePreviewFile = useCallback(async (path: string, name: string) => {
    setPreviewFile({ path, name, loading: true });
    try {
      const info = await api.getPreviewInfo(path);
      const previewType = info.previewType;
      const baseInfo = { ext: info.ext, size: info.size, is_image: info.is_image, previewType };

      // 这些类型不需要读内容，由 PreviewModal 通过 asset 协议直接渲染
      if (["pdf", "video", "audio", "word_legacy"].includes(previewType)) {
        setPreviewFile({ path, name, loading: false, info: baseInfo });
        return;
      }
      // 图片通过 asset 协议 URL
      if (previewType === "image") {
        setPreviewFile({
          path,
          name,
          loading: false,
          info: { ...baseInfo, is_image: true },
          content: path,
        });
        return;
      }
      // 需要二进制 base64 的类型（Office / 电子书 / 3D / 字体 / 邮件 / 字幕 / 地理 / RTF / IPYNB / 压缩包）
      const binaryTypes = [
        "excel", "word", "pptx",
        "ipynb", "epub", "archive",
        "subtitle", "email", "model3d",
        "font", "geo", "rtf",
      ];
      if (binaryTypes.includes(previewType)) {
        const binaryBase64 = await api.readFileBinary(path);
        setPreviewFile({ path, name, loading: false, info: baseInfo, content: binaryBase64 });
        return;
      }
      // HTML 从文本读取后渲染
      if (previewType === "html") {
        try {
          const content = await api.readFileContent(path);
          setPreviewFile({ path, name, content, loading: false, info: baseInfo });
        } catch {
          // 如果文件太大或编码问题，退回用二进制
          const binaryBase64 = await api.readFileBinary(path);
          setPreviewFile({ path, name, loading: false, info: baseInfo, content: binaryBase64 });
        }
        return;
      }
      // Markdown / 文本 / 代码 读取文本内容
      if (previewType === "markdown" || previewType === "text") {
        const content = await api.readFileContent(path);
        setPreviewFile({ path, name, content, loading: false, info: baseInfo });
        return;
      }
      // 不可预览类型
      setPreviewFile({ path, name, loading: false, info: baseInfo });
    } catch (error) {
      setPreviewFile({ path, name, loading: false, error: String(error) });
    }
  }, []);

  const hasRoot = Boolean(data.settings.workspaceRoot);

  return (
    <div
      className={`app-shell theme-${themeMode} accent-${accentColor}${sidebarOpen ? " sidebar-open" : ""}`}
    >
      {/* 側邊欄遮罩 (窄屏) */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* 側邊欄 */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Archive size={20} />
          </div>
          <span className="brand-name">
            {registry?.workspaces.find((w) => w.id === registry.activeWorkspaceId)?.name ||
              t.appName}
          </span>
        </div>

        <nav>
          {[
            { id: "home" as const, label: t.home, icon: Home },
            { id: "projects" as const, label: t.projects, icon: FolderKanban },
            { id: "notes" as const, label: language === "zh" ? "便签" : "Notes", icon: StickyNote },
            { id: "trash" as const, label: t.trash, icon: Trash2 },
            { id: "settings" as const, label: t.settings, icon: Settings },
          ].map((item) => (
            <button
              className={view === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => {
                setSidebarOpen(false);
                if (item.id === "projects") {
                  const projects = data.projects;
                  if (projects.length > 0) {
                    const recent = [...projects].sort((a, b) =>
                      (b.lastOpenedAt || "").localeCompare(a.lastOpenedAt || "")
                    )[0];
                    openProject(recent);
                    return;
                  }
                }
                navigate(item.id);
              }}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="side-section">
          <div className="side-title">{t.projectList}</div>
          {sidebarProjects.length === 0 ? (
            <p className="muted small">
              {language === "zh" ? "沒有匹配的項目。" : "No matching projects."}
            </p>
          ) : (
            sidebarProjects.map((project) => (
              <div
                className={
                  project.id === activeProject?.id
                    ? "project-shortcut-row active"
                    : "project-shortcut-row"
                }
                key={project.id}
                onContextMenu={(e) => handleProjectContextMenu(e, project)}
              >
                <button
                  className="project-shortcut-main"
                  onClick={() => {
                    setSidebarOpen(false);
                    openProject(project);
                  }}
                >
                  <Star size={15} fill={project.pinned ? "currentColor" : "none"} />
                  <span>{project.name}</span>
                </button>
                {project.pinned && (
                  <button
                    className="side-icon-button"
                    onClick={() => api.togglePin(project.id).then(setData)}
                    title={t.unpinned}
                  >
                    <Pin size={14} />
                  </button>
                )}
                <button
                  className="side-icon-button project-row-folder"
                  onClick={() => api.openFolder(project.path)}
                  title={t.openProjectFolder}
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 工作空間切換 */}
        <div className="sidebar-footer">
          <button
            ref={wsTriggerRef}
            className={`sidebar-ws-btn${wsDropdownOpen ? " open" : ""}`}
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
          >
            <Database size={14} />
            <span>
              {registry?.workspaces.find((w) => w.id === registry.activeWorkspaceId)?.name ||
                t.appName}
            </span>
            <ChevronDown size={13} className="sidebar-ws-chevron" />
          </button>
        </div>

        {wsDropdownOpen && registry && (
          <div className="workspace-popover" ref={wsPopoverRef}>
            <div className="popover-header">{t.workspaceSwitch}</div>
            {registry.workspaces.map((ws) => (
              <button
                className={ws.id === registry.activeWorkspaceId ? "ws-item active" : "ws-item"}
                key={ws.id}
                onClick={() => handleSwitchWorkspace(ws.id)}
              >
                <Archive size={15} />
                <span>{ws.name}</span>
              </button>
            ))}
            <button className="ws-item ws-create" onClick={() => setWsCreating(true)}>
              <Plus size={15} />
              <span>{t.newDatabase}</span>
            </button>
            {wsCreating && (
              <div className="ws-create-input">
                <input
                  value={wsNewName}
                  onChange={(e) => setWsNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateWorkspace();
                    if (e.key === "Escape") {
                      setWsCreating(false);
                      setWsNewName("");
                    }
                  }}
                  placeholder={t.databaseNamePlaceholder}
                  autoFocus
                />
                <button
                  className="primary compact-button"
                  onClick={handleCreateWorkspace}
                  disabled={!wsNewName.trim()}
                >
                  {t.confirm}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* 主內容區 */}
      <main className="main">
        {!hasRoot && (
          <div className="warning-banner">
            <span>{t.noRootWarning}</span>
            <button className="warning-banner-btn" onClick={() => navigate("settings")}>
              {t.goToSettings}
            </button>
          </div>
        )}

        <header className="topbar">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开菜单"
          >
            <Menu size={20} />
          </button>
          <div className="topbar-nav-history">
            <button
              className="nav-history-btn"
              onClick={goBack}
              disabled={!canGoBack}
              title="后退 (Alt+←)"
              aria-label="后退"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="nav-history-btn"
              onClick={goForward}
              disabled={!canGoForward}
              title="前进 (Alt+→)"
              aria-label="前进"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {view === "projects" && activeProject ? (
            <div className="topbar-breadcrumb">
              <button className="breadcrumb-btn" onClick={() => navigate("home")}>
                <Home size={14} />
                {t.home}
              </button>
              <ChevronRight size={13} className="breadcrumb-sep" />
              <span className="breadcrumb-current">{activeProject.name}</span>
            </div>
          ) : (
            <div className="command-search" onClick={() => setSpotlightOpen(true)}>
              <span className="command-search-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <span className="command-search-placeholder">{t.searchPlaceholder}</span>
              <kbd className="command-search-kbd">Ctrl+K</kbd>
            </div>
          )}
          <div className="topbar-actions">
            <button
              className="primary"
              onClick={() => setNewProjectOpen(true)}
              disabled={!hasRoot}
              title={hasRoot ? undefined : t.noRootWarning}
            >
              <Plus size={16} />
              {t.newProject}
            </button>
          </div>
        </header>

        {/* 視圖 */}
        {view === "home" && (
          <HomeView
            data={data}
            recentProjects={recentProjects}
            onOpenProject={openProject}
            onNewProject={() => (hasRoot ? setNewProjectOpen(true) : navigate("settings"))}
            onImport={addInboxFiles}
            t={t}
          />
        )}

        {view === "projects" && activeProject && (
          <ProjectsView
            data={data}
            setData={setData}
            activeProject={activeProject}
            language={language}
            t={t}
            copiedFile={copiedFile}
            onCopyFile={setCopiedFile}
            onPreviewFile={handlePreviewFile}
            fileChangeEpoch={fileChangeEpoch}
            currentCategory={currentCategory}
            onCategoryChange={(next, replace) =>
              navigate("projects", activeProject.id, { category: next, replace })
            }
            highlightFile={highlightFile}
          />
        )}

        {view === "inbox" && (
          <InboxView
            data={data}
            selected={selectedInbox}
            onSelectedChange={setSelectedInbox}
            onImport={addInboxFiles}
            onOrganize={organizeInbox}
            onDataChange={setData}
            t={t}
          />
        )}

        {view === "settings" && (
          <SettingsView
            data={data}
            setData={setData}
            registry={registry}
            language={language}
            setLanguage={setLanguage}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            accentColor={accentColor}
            setAccentColor={setAccentColor}
            t={t}
            onRename={(id, name) =>
              setDialog({ type: "rename-workspace", workspaceId: id, currentName: name })
            }
            onDelete={(id, name) => setDialog({ type: "delete-workspace", workspaceId: id, name })}
            onSwitch={handleSwitchWorkspace}
            onMigrateRoot={(oldRoot, newRoot, fileCount) =>
              setDialog({ type: "migrate-root", oldRoot, newRoot, fileCount })
            }
            categories={data.settings.categories}
            onEditCategories={() => setCategoryEditOpen(true)}
          />
        )}

        {view === "trash" && (
          <TrashView
            t={t}
            workspaceKey={registry?.activeWorkspaceId}
            onProjectRestored={async () => {
              setData(await api.getData());
            }}
            onProjectsTrashChanged={async () => {
              setData(await api.getData());
            }}
          />
        )}

        {view === "notes" && (
          <NotesView
            language={language}
            currentNoteId={currentNoteId}
            onNoteChange={(id, replace) =>
              navigate("notes", null, { noteId: id, replace })
            }
          />
        )}
      </main>

      {/* 彈窗 */}
      {newProjectOpen && (
        <NewProjectDialog
          root={data.settings.workspaceRoot}
          onClose={() => setNewProjectOpen(false)}
          onCreated={(next) => {
            setData(next);
            setNewProjectOpen(false);
            // 新建项目刚被 insert 到位置 0,跳到该项目;若取不到则回首页
            const newId = next.projects[0]?.id ?? null;
            navigate(newId ? "projects" : "home", newId);
          }}
          onSubmit={api.createProject}
        />
      )}

      {dialog.type === "rename-workspace" && (
        <RenameWorkspaceDialog
          currentName={dialog.currentName}
          onConfirm={(name) => handleRenameConfirm(dialog.workspaceId, name)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}

      {dialog.type === "delete-workspace" && (
        <ConfirmDeleteDialog
          name={dialog.name}
          onConfirm={() => handleDeleteConfirm(dialog.workspaceId)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}

      {dialog.type === "rename-project" && (
        <RenameProjectDialog
          currentName={dialog.currentName}
          onConfirm={(name) => handleProjectRenameConfirm(dialog.projectId, name)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}

      {dialog.type === "delete-project" && (
        <ConfirmDangerDialog
          title="删除项目"
          message={`确定删除项目「${dialog.name}」？该项目会进入回收站，30 天后自动永久删除。`}
          confirmLabel="删除"
          cancelLabel="取消"
          onConfirm={() => handleProjectDeleteConfirm(dialog.projectId)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}

      {showBootstrap && (
        <BootstrapDialog
          defaultRoot={data.settings.workspaceRoot}
          language={language}
          onUseDefault={() => {
            storage.set("archive.bootstrapDone", true);
            setShowBootstrap(false);
          }}
          onPickCustom={async () => {
            try {
              const picked = await api.selectRoot();
              if (picked) {
                setData(await api.updateRoot(picked));
              }
            } catch (err) {
              console.error("bootstrap selectRoot failed:", err);
            } finally {
              storage.set("archive.bootstrapDone", true);
              setShowBootstrap(false);
            }
          }}
        />
      )}

      {dialog.type === "migrate-root" && (
        <MigrateRootDialog
          oldRoot={dialog.oldRoot}
          newRoot={dialog.newRoot}
          fileCount={dialog.fileCount}
          t={t}
          onConfirm={(migrate) => handleMigrateRoot(dialog.oldRoot, dialog.newRoot, migrate)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}

      {previewFile && (
        <PreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onOpenExternal={() => api.openFile(previewFile.path)}
          themeMode={themeMode}
        />
      )}

      {categoryEditOpen && (
        <CategoryEditModal
          categories={data.settings.categories}
          editing={categoryEditing}
          newName={categoryNewName}
          onNewNameChange={setCategoryNewName}
          onSave={handleSaveCategory}
          onDelete={handleDeleteCategory}
          onEdit={openEditCategory}
          onAdd={openAddCategory}
          onClose={() => {
            setCategoryEditOpen(false);
            setCategoryEditing(null);
          }}
        />
      )}

      {/* Spotlight 全局搜索 */}
      <SpotlightSearch
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        data={data}
        onOpenProject={openProject}
        onSelectInbox={(itemId) => {
          navigate("inbox");
          setSelectedInbox([itemId]);
        }}
        onNavigateToFolder={(projectName, category) => {
          const project = data.projects.find((p) => p.name === projectName);
          if (project) {
            navigate("projects", project.id, { category });
          }
        }}
        onPreviewFile={handlePreviewFile}
        onNavigateToFile={(projectName, category, filePath) => {
          const project = data.projects.find((p) => p.name === projectName);
          if (!project) return;
          navigate("projects", project.id, { category });
          setHighlightFile({ path: filePath, ts: Date.now() });
        }}
        onSelectNote={(noteId) => {
          navigate("notes", null, { noteId });
        }}
      />

      {projectMenu && (
        <ContextMenu
          x={projectMenu.x}
          y={projectMenu.y}
          onClose={closeProjectMenu}
          items={
            [
              {
                label: projectMenu.project.pinned ? t.unpinned : t.pinned,
                icon: projectMenu.project.pinned ? <PinOff size={14} /> : <Pin size={14} />,
                onClick: () => {
                  void api.togglePin(projectMenu.project.id).then(setData);
                },
              },
              {
                label: t.rename,
                onClick: () =>
                  setDialog({
                    type: "rename-project",
                    projectId: projectMenu.project.id,
                    currentName: projectMenu.project.name,
                  }),
              },
              {
                label: t.openContainingFolder,
                onClick: () => {
                  void api.openFolder(projectMenu.project.path);
                },
              },
              { divider: true },
              {
                label: t.deleteAction,
                danger: true,
                onClick: () =>
                  setDialog({
                    type: "delete-project",
                    projectId: projectMenu.project.id,
                    name: projectMenu.project.name,
                  }),
              },
            ] satisfies ContextMenuItem[]
          }
        />
      )}
    </div>
  );
}
