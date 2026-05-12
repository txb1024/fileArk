import {
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileInput,
  FolderPlus,
  FolderKanban,
  FolderOpen,
  Home,
  Inbox,
  Moon,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  Tags,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, CategoryFile, InboxItem, Project, WorkspaceRegistry } from "./types";

type DragFile = File & {
  path?: string;
};

type View = "home" | "projects" | "inbox" | "search" | "settings";
type Language = "zh" | "en";
type ThemeMode = "light" | "dark";
type AccentColor = "teal" | "blue" | "violet" | "orange";
type SortMode = "name" | "time";
type FileScale = "compact" | "comfortable" | "large";

// ── 彈窗狀態 ──────────────────────────────────────────────
type DialogState =
  | { type: "none" }
  | { type: "rename-workspace"; workspaceId: string; currentName: string }
  | { type: "delete-workspace"; workspaceId: string; name: string };

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
    openProjectFolder: "打开项目根目录",
    searchPlaceholder: "搜索项目、别名、标签、文件  Ctrl+K",
    importFiles: "导入文件",
    newProject: "新建项目",
    categories: "分类",
    filterByName: "按文件名称筛选",
    openCategoryFolder: "打开分类文件夹",
    addFiles: "加入文件",
    newFolder: "新建目录",
    sortByName: "按名称",
    sortByTime: "按时间",
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
    folderNamePrompt: "请输入新目录名称",
    language: "语言",
    theme: "主题",
    accent: "主题色",
    light: "日间",
    dark: "夜间",
    scale: "缩放",
    noRootWarning: "尚未设置工作目录，请先前往设置页面配置，再新建项目。",
    goToSettings: "前往设置"
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
    openProjectFolder: "Open project folder",
    searchPlaceholder: "Search projects, aliases, tags, files  Ctrl+K",
    importFiles: "Import",
    newProject: "New Project",
    categories: "Categories",
    filterByName: "Filter by file name",
    openCategoryFolder: "Open category folder",
    addFiles: "Add Files",
    newFolder: "New Folder",
    sortByName: "Name",
    sortByTime: "Time",
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
    folderNamePrompt: "Enter a new folder name",
    language: "Language",
    theme: "Theme",
    accent: "Accent",
    light: "Light",
    dark: "Dark",
    scale: "Scale",
    noRootWarning: "Workspace root is not set. Please configure it in Settings before creating projects.",
    goToSettings: "Go to Settings"
  }
} as const;

const emptyData: AppData = {
  projects: [],
  inbox: [],
  activities: [],
  settings: {
    workspaceRoot: "",
    categories: []
  }
};

function formatDate(value: string | null) {
  if (!value) return "暫無";
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function contains(project: Project, query: string) {
  const text = [project.name, project.alias, project.path, ...project.tags].join(" ").toLowerCase();
  return text.includes(query.toLowerCase());
}

export function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [registry, setRegistry] = useState<WorkspaceRegistry | null>(null);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [wsCreating, setWsCreating] = useState(false);
  const [wsNewName, setWsNewName] = useState("");
  const [view, setView] = useState<View>("home");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedInbox, setSelectedInbox] = useState<string[]>([]);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("archive.language") as Language) || "zh");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem("archive.theme") as ThemeMode) || "light");
  const [accentColor, setAccentColor] = useState<AccentColor>(() => (localStorage.getItem("archive.accent") as AccentColor) || "teal");
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [categoryCollapsed, setCategoryCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const t = messages[language];

  useEffect(() => {
    window.archiveApi.listWorkspaces().then(setRegistry);
    window.archiveApi.getData().then(setData);
  }, []);

  useEffect(() => {
    localStorage.setItem("archive.language", language);
    localStorage.setItem("archive.theme", themeMode);
    localStorage.setItem("archive.accent", accentColor);
  }, [language, themeMode, accentColor]);

  useEffect(() => {
    if (data.projects.length === 0) return;
    if (!activeProjectId || !data.projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(data.projects[0].id);
    }
  }, [data.projects, activeProjectId]);

  // 全局快捷鍵：Ctrl+K 聚焦搜索，Ctrl+N 新建項目
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setView("search");
      }
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        if (data.settings.workspaceRoot) setNewProjectOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data.settings.workspaceRoot]);

  const activeProject = data.projects.find((project) => project.id === activeProjectId);

  const sidebarProjects = useMemo(() => {
    return [...data.projects].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name, language === "zh" ? "zh-Hans" : "en", { numeric: true, sensitivity: "base" });
    });
  }, [data.projects, language]);

  const recentProjects = [...data.projects]
    .sort((a, b) => new Date(b.lastOpenedAt || b.updatedAt).getTime() - new Date(a.lastOpenedAt || a.updatedAt).getTime())
    .slice(0, 6);

  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return { projects: [], files: [], inbox: [] as InboxItem[] };

    const files = data.projects.flatMap((project) =>
      (project.recentFiles || [])
        .filter((file) => `${file.name} ${file.category} ${project.name}`.toLowerCase().includes(trimmed.toLowerCase()))
        .map((file) => ({ ...file, projectName: project.name }))
    );

    return {
      projects: data.projects.filter((project) => contains(project, trimmed)),
      files,
      inbox: data.inbox.filter((item) => item.name.toLowerCase().includes(trimmed.toLowerCase()))
    };
  }, [data, query]);

  async function openProject(project: Project) {
    setActiveProjectId(project.id);
    setView("projects");
    setData(await window.archiveApi.markProjectOpened(project.id));
  }

  async function openProjectFolder(project: Project) {
    setActiveProjectId(project.id);
    setView("projects");
    await window.archiveApi.openFolder(project.path);
    setData(await window.archiveApi.markProjectOpened(project.id));
  }

  async function addInboxFiles() {
    const files = await window.archiveApi.selectFiles();
    if (files.length > 0) {
      setData(await window.archiveApi.addInboxFiles(files));
      setView("inbox");
    }
  }

  async function organizeInbox(projectId: string, category: string, itemIds = selectedInbox) {
    if (!projectId || itemIds.length === 0) return;
    setData(await window.archiveApi.organizeInbox({ itemIds, projectId, category }));
    setSelectedInbox([]);
  }

  async function handleSwitchWorkspace(workspaceId: string) {
    const newData = await window.archiveApi.switchWorkspace(workspaceId);
    setData(newData);
    setRegistry(await window.archiveApi.listWorkspaces());
    setView("home");
    setActiveProjectId(null);
    setWsDropdownOpen(false);
  }

  async function handleCreateWorkspace() {
    if (!wsNewName.trim()) {
      setWsCreating(true);
      return;
    }
    const newRegistry = await window.archiveApi.createWorkspace(wsNewName.trim());
    setRegistry(newRegistry);
    setData(await window.archiveApi.getData());
    setView("settings");
    setActiveProjectId(null);
    setWsDropdownOpen(false);
    setWsCreating(false);
    setWsNewName("");
  }

  // ── 資料庫操作（用內嵌彈窗替代 prompt/confirm）──────────
  function openRenameDialog(workspaceId: string, currentName: string) {
    setDialog({ type: "rename-workspace", workspaceId, currentName });
  }

  function openDeleteDialog(workspaceId: string, name: string) {
    setDialog({ type: "delete-workspace", workspaceId, name });
  }

  async function handleRenameConfirm(workspaceId: string, newName: string) {
    setRegistry(await window.archiveApi.renameWorkspace(workspaceId, newName.trim()));
    setDialog({ type: "none" });
  }

  async function handleDeleteConfirm(workspaceId: string) {
    setRegistry(await window.archiveApi.deleteWorkspace(workspaceId));
    setDialog({ type: "none" });
  }

  const navigation = [
    { id: "home" as const, label: t.home, icon: Home },
    { id: "projects" as const, label: t.projects, icon: FolderKanban },
    { id: "inbox" as const, label: t.inbox, icon: Inbox },
    { id: "search" as const, label: t.search, icon: Search },
    { id: "settings" as const, label: t.settings, icon: Settings }
  ];

  const hasRoot = Boolean(data.settings.workspaceRoot);

  return (
    <div className={`app-shell theme-${themeMode} accent-${accentColor}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Archive size={20} />
          </div>
          <span className="brand-name">{registry?.workspaces.find((w) => w.id === registry.activeWorkspaceId)?.name || t.appName}</span>
        </div>

        <nav>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setView(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="side-section">
          <div className="side-title">{t.projectList}</div>
          {sidebarProjects.length === 0 ? (
            <p className="muted small">{language === "zh" ? "沒有匹配的項目。" : "No matching projects."}</p>
          ) : (
            sidebarProjects.map((project) => (
              <div className={project.id === activeProject?.id ? "project-shortcut-row active" : "project-shortcut-row"} key={project.id}>
                <button className="project-shortcut-main" onClick={() => openProject(project)}>
                  <Star size={15} fill={project.pinned ? "currentColor" : "none"} />
                  <span>{project.name}</span>
                </button>
                <button
                  className="side-icon-button"
                  onClick={async () => setData(await window.archiveApi.togglePin(project.id))}
                  title={t.pinned}
                  aria-label={t.pinned}
                >
                  <Pin size={14} />
                </button>
                <button
                  className="side-icon-button"
                  onClick={() => openProjectFolder(project)}
                  title={t.openProjectFolder}
                  aria-label={t.openProjectFolder}
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 工作空間切換（底部） */}
        <div className="sidebar-footer">
          <button className="sidebar-ws-btn" onClick={() => setWsDropdownOpen(!wsDropdownOpen)}>
            <Database size={14} />
            <span>{registry?.workspaces.find((w) => w.id === registry.activeWorkspaceId)?.name || t.appName}</span>
            <ChevronDown size={13} />
          </button>
        </div>

        {wsDropdownOpen && registry && (
          <div className="workspace-popover">
            <div className="popover-header">切換資料庫</div>
            {registry.workspaces.map((ws) => (
              <button
                className={ws.id === registry.activeWorkspaceId ? "ws-item active" : "ws-item"}
                key={ws.id}
                onClick={() => { handleSwitchWorkspace(ws.id); setWsDropdownOpen(false); }}
              >
                <Archive size={15} />
                <span>{ws.name}</span>
                {ws.id === registry.activeWorkspaceId && <span className="ws-check"><Check size={13} /></span>}
              </button>
            ))}
            <button className="ws-item ws-create" onClick={() => { setWsCreating(true); }}>
              <Plus size={15} />
              <span>新建資料庫</span>
            </button>
            {wsCreating && (
              <div className="ws-create-input">
                <input
                  value={wsNewName}
                  onChange={(e) => setWsNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateWorkspace();
                    if (e.key === "Escape") { setWsCreating(false); setWsNewName(""); }
                  }}
                  placeholder="輸入資料庫名稱"
                  autoFocus
                />
                <button className="primary compact-button" onClick={handleCreateWorkspace} disabled={!wsNewName.trim()}>
                  確定
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <main className="main">
        {/* 工作目錄未設置提示橫幅 */}
        {!hasRoot && (
          <div className="warning-banner">
            <span>{t.noRootWarning}</span>
            <button className="warning-banner-btn" onClick={() => setView("settings")}>{t.goToSettings}</button>
          </div>
        )}

        <header className="topbar">
          <div className="command-search">
            <Search size={18} />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setView("search");
              }}
              placeholder={t.searchPlaceholder}
            />
          </div>
          <div className="topbar-actions">
            <select className="toolbar-select" value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t.language}>
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
            <button className="secondary icon-text-button" onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")}>
              {themeMode === "light" ? <Sun size={17} /> : <Moon size={17} />}
              {themeMode === "light" ? t.light : t.dark}
            </button>
            <select className="toolbar-select" value={accentColor} onChange={(event) => setAccentColor(event.target.value as AccentColor)} aria-label={t.accent}>
              <option value="teal">Teal</option>
              <option value="blue">Blue</option>
              <option value="violet">Violet</option>
              <option value="orange">Orange</option>
            </select>
            <button className="secondary" onClick={addInboxFiles}>
              <FileInput size={17} />
              {t.importFiles}
            </button>
            <button
              className="primary"
              onClick={() => setNewProjectOpen(true)}
              disabled={!hasRoot}
              title={hasRoot ? undefined : t.noRootWarning}
            >
              <Plus size={17} />
              {t.newProject}
            </button>
          </div>
        </header>

        {view === "home" && (
          <HomeView
            data={data}
            recentProjects={recentProjects}
            onOpenProject={openProject}
            onNewProject={() => { if (hasRoot) setNewProjectOpen(true); else setView("settings"); }}
            onImport={addInboxFiles}
          />
        )}

        {view === "projects" && activeProject && (
          <ProjectsView
            data={data}
            activeProject={activeProject}
            onDataChange={setData}
            language={language}
            t={t}
            categoryCollapsed={categoryCollapsed}
            onCategoryCollapsedChange={setCategoryCollapsed}
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
          />
        )}

        {view === "search" && (
          <SearchView
            query={query}
            setQuery={setQuery}
            results={searchResults}
            onOpenProject={openProject}
          />
        )}

        {view === "settings" && (
          <SettingsView
            data={data}
            setData={setData}
            registry={registry}
            setRegistry={setRegistry}
            onRename={openRenameDialog}
            onDelete={openDeleteDialog}
            onSwitch={(id) => handleSwitchWorkspace(id)}
          />
        )}
      </main>

      {newProjectOpen && (
        <NewProjectDialog
          root={data.settings.workspaceRoot}
          onClose={() => setNewProjectOpen(false)}
          onCreated={(next) => {
            setData(next);
            setNewProjectOpen(false);
            setView("projects");
          }}
        />
      )}

      {/* 重命名資料庫彈窗 */}
      {dialog.type === "rename-workspace" && (
        <RenameWorkspaceDialog
          currentName={dialog.currentName}
          onConfirm={(name) => handleRenameConfirm(dialog.workspaceId, name)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}

      {/* 刪除資料庫確認彈窗 */}
      {dialog.type === "delete-workspace" && (
        <ConfirmDeleteDialog
          name={dialog.name}
          onConfirm={() => handleDeleteConfirm(dialog.workspaceId)}
          onClose={() => setDialog({ type: "none" })}
        />
      )}
    </div>
  );
}

// ── HomeView ──────────────────────────────────────────────

function HomeView({
  data,
  recentProjects,
  onOpenProject,
  onNewProject,
  onImport
}: {
  data: AppData;
  recentProjects: Project[];
  onOpenProject: (project: Project) => void;
  onNewProject: () => void;
  onImport: () => void;
}) {
  return (
    <section className="page">
      <div className="hero-band">
        <div>
          <p className="eyebrow">項目入口管理器</p>
          <h1>不用再一層層點文件夾。</h1>
          <p>用項目、別名、標籤和最近訪問，把零散資料快速歸位並找回來。</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={onNewProject}>
            <Plus size={18} />
            新建項目
          </button>
          <button className="secondary" onClick={onImport}>
            <FileInput size={18} />
            加入收件箱
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="項目數量" value={String(data.projects.length)} />
        <Metric label="待整理文件" value={String(data.inbox.length)} />
        <Metric label="置頂項目" value={String(data.projects.filter((project) => project.pinned).length)} />
        <Metric label="工作目錄" value={data.settings.workspaceRoot || "未設置"} compact tooltip={data.settings.workspaceRoot} />
      </div>

      <div className="split">
        <Panel title="最近項目" icon={<Clock3 size={18} />}>
          {recentProjects.length === 0 ? (
            <EmptyState title="還沒有項目" body="先新建一個項目，軟件會自動建立標準分類資料夾。" />
          ) : (
            <div className="project-grid">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onOpen={() => onOpenProject(project)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="最近操作" icon={<Sparkles size={18} />}>
          {data.activities.length === 0 ? (
            <EmptyState title="暫無操作記錄" body="新建項目、導入文件和歸類文件後會顯示在這裡。" />
          ) : (
            <div className="activity-list">
              {data.activities.slice(0, 8).map((activity) => (
                <div className="activity" key={activity.id}>
                  <span>{activity.title}</span>
                  <time>{formatDate(activity.createdAt)}</time>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

// ── ProjectsView ──────────────────────────────────────────

function ProjectsView({
  data,
  activeProject,
  onDataChange,
  language,
  t,
  categoryCollapsed,
  onCategoryCollapsedChange
}: {
  data: AppData;
  activeProject: Project;
  onDataChange: (data: AppData) => void;
  language: Language;
  t: (typeof messages)[Language];
  categoryCollapsed: boolean;
  onCategoryCollapsedChange: (v: boolean) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState(data.settings.categories[0] || "");
  const [categoryFiles, setCategoryFiles] = useState<CategoryFile[]>([]);
  const [fileFilter, setFileFilter] = useState("");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [fileScale, setFileScale] = useState<FileScale>("comfortable");
  const [newFolderName, setNewFolderName] = useState("");

  // 切換項目時重置狀態
  useEffect(() => {
    setSelectedCategory(data.settings.categories[0] || "");
    setFileFilter("");
  }, [activeProject.id]);

  useEffect(() => {
    if (!activeProject || !selectedCategory) {
      setCategoryFiles([]);
      return;
    }
    window.archiveApi.listCategoryFiles(activeProject.path, selectedCategory).then(setCategoryFiles);
  }, [activeProject, selectedCategory]);

  async function refreshCategoryFiles() {
    if (!activeProject || !selectedCategory) return;
    setCategoryFiles(await window.archiveApi.listCategoryFiles(activeProject.path, selectedCategory));
  }

  async function addFilesToCategory(filePaths?: string[]) {
    if (!activeProject || !selectedCategory) return;
    const files = filePaths || await window.archiveApi.selectFiles();
    if (files.length === 0) return;
    const next = await window.archiveApi.addFilesToCategory({
      projectId: activeProject.id,
      category: selectedCategory,
      filePaths: files
    });
    onDataChange(next);
    await refreshCategoryFiles();
  }

  async function createFolderInCategory() {
    if (!activeProject || !selectedCategory) return;
    if (!newFolderName.trim()) return;
    const nextFiles = await window.archiveApi.createCategoryFolder({
      projectId: activeProject.id,
      category: selectedCategory,
      folderName: newFolderName.trim()
    });
    setCategoryFiles(nextFiles);
    setNewFolderName("");
  }

  function getDroppedFilePaths(event: React.DragEvent) {
    return Array.from(event.dataTransfer.files)
      .map((file) => (file as DragFile).path)
      .filter((filePath): filePath is string => Boolean(filePath));
  }

  const sortFiles = (files: CategoryFile[]) =>
    [...files].sort((a, b) => {
      if (sortMode === "time") {
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
      }
      return a.name.localeCompare(b.name, language === "zh" ? "zh-Hans" : "en", { numeric: true, sensitivity: "base" });
    });

  const matchesFilter = (file: CategoryFile) => file.name.toLowerCase().includes(fileFilter.trim().toLowerCase());
  const filteredFiles = sortFiles(categoryFiles.filter((file) => matchesFilter(file) || file.children?.some(matchesFilter)));
  const rootFiles = filteredFiles.filter((file) => !file.isDirectory && matchesFilter(file));
  const folderSections = filteredFiles
    .filter((file) => file.isDirectory)
    .map((folder) => ({ ...folder, children: sortFiles((folder.children || []).filter(matchesFilter)) }));

  // 分類計數：直接讀取 listCategoryFiles，此處用 recentFiles 作參考值並標注 "近似"
  const categoryCounts = data.settings.categories.reduce<Record<string, number>>((acc, category) => {
    acc[category] = (activeProject.recentFiles || []).filter((file) => file.category === category).length;
    return acc;
  }, {});

  return (
    <section className="page projects-page">
      <div className="project-detail">
        <div className={`workspace-grid ${categoryCollapsed ? "category-collapsed" : ""}`}>
          <div className={`project-list-panel category-side-panel ${categoryCollapsed ? "collapsed" : ""}`}>
            <div className="panel-mini-title">
              {!categoryCollapsed && t.categories}
              <button
                className="collapse-btn"
                onClick={() => onCategoryCollapsedChange(!categoryCollapsed)}
                title={categoryCollapsed ? "展开分类" : "收起分类"}
              >
                {categoryCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            </div>
            <div className="category-list">
              {data.settings.categories.map((category) => (
                <button
                  className={category === selectedCategory ? "category-row active" : "category-row"}
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                >
                  <span>
                    <FolderKanban size={18} />
                    {category}
                  </span>
                  {categoryCounts[category] > 0 && <small>{categoryCounts[category]}</small>}
                </button>
              ))}
            </div>
          </div>

          <Panel title={selectedCategory || t.name} icon={<FolderOpen size={18} />}>
            <div className="file-toolbar">
              <div className="inline-search">
                <Search size={17} />
                <input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder={t.filterByName} />
                {fileFilter && (
                  <button className="icon-button" onClick={() => setFileFilter("")} aria-label="Clear">
                    <X size={16} />
                  </button>
                )}
              </div>
              <select className="toolbar-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="name">{t.sortByName}</option>
                <option value="time">{t.sortByTime}</option>
              </select>
              <select className="toolbar-select" value={fileScale} onChange={(event) => setFileScale(event.target.value as FileScale)} aria-label={t.scale}>
                <option value="compact">S</option>
                <option value="comfortable">M</option>
                <option value="large">L</option>
              </select>
              <button
                className="icon-button folder-icon-button"
                onClick={() => window.archiveApi.openFolder(`${activeProject.path}\\${selectedCategory}`)}
                title={t.openCategoryFolder}
                aria-label={t.openCategoryFolder}
              >
                <FolderOpen size={17} />
              </button>
              <div className="new-folder-control">
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createFolderInCategory();
                  }}
                  placeholder={t.folderNamePrompt}
                />
              </div>
              <button className="secondary icon-text-button" onClick={createFolderInCategory} disabled={!newFolderName.trim()}>
                <FolderPlus size={17} />
                {t.newFolder}
              </button>
              <button className="primary" onClick={() => addFilesToCategory()}>
                <Plus size={17} />
                {t.addFiles}
              </button>
            </div>

            <div className="file-table-head">
              <span>{t.name}</span>
              <span>{t.modifiedAt}</span>
              <span>{t.size}</span>
            </div>

            <div
              className={isDraggingFiles ? "file-drop-zone dragging" : "file-drop-zone"}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingFiles(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setIsDraggingFiles(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingFiles(false);
                addFilesToCategory(getDroppedFilePaths(event));
              }}
            >
              <div className="drop-hint">{t.dragHint}</div>
              {filteredFiles.length === 0 ? (
                <EmptyState
                  title={categoryFiles.length === 0 ? t.emptyCategory : t.noMatch}
                  body={categoryFiles.length === 0 ? t.emptyCategoryBody : t.noMatchBody}
                />
              ) : (
                <div className={`file-table file-table-${fileScale}`}>
                  {rootFiles.length > 0 && (
                    <FileSection
                      title={t.rootFiles}
                      files={rootFiles}
                      folderLabel={t.folder}
                    />
                  )}
                  {folderSections.map((folder) => (
                    <FileSection
                      key={folder.path}
                      title={folder.name}
                      files={folder.children || []}
                      folderLabel={t.folder}
                      onOpenFolder={() => window.archiveApi.openFolder(folder.path)}
                    />
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

// ── FileSection ───────────────────────────────────────────

function FileSection({
  title,
  files,
  folderLabel,
  onOpenFolder
}: {
  title: string;
  files: CategoryFile[];
  folderLabel: string;
  onOpenFolder?: () => void;
}) {
  return (
    <section className="file-section">
      <div className="file-section-title">
        <span>{title}</span>
        {onOpenFolder && (
          <button className="icon-button" onClick={onOpenFolder} title={folderLabel} aria-label={folderLabel}>
            <FolderOpen size={15} />
          </button>
        )}
      </div>
      {files.length === 0 ? (
        <div className="file-section-empty">Empty</div>
      ) : (
        files.map((file) => (
          <button className="file-table-row" key={file.path} onClick={() => window.archiveApi.openFile(file.path)}>
            <span>{file.name}</span>
            <small>{formatDate(file.modifiedAt)}</small>
            <small>{file.isDirectory ? folderLabel : formatSize(file.size)}</small>
          </button>
        ))
      )}
    </section>
  );
}

// ── InboxView ─────────────────────────────────────────────

function InboxView({
  data,
  selected,
  onSelectedChange,
  onImport,
  onOrganize,
  onDataChange
}: {
  data: AppData;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onImport: () => void;
  onOrganize: (projectId: string, category: string, itemIds?: string[]) => void;
  onDataChange: (data: AppData) => void;
}) {
  const [projectId, setProjectId] = useState(data.projects[0]?.id || "");
  const [category, setCategory] = useState(data.settings.categories[0] || "");

  useEffect(() => {
    if (!projectId && data.projects[0]) setProjectId(data.projects[0].id);
  }, [data.projects, projectId]);

  function toggle(id: string) {
    onSelectedChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  async function handleDeleteSelected() {
    if (selected.length === 0) return;
    const next = await window.archiveApi.deleteInboxItems(selected);
    onDataChange(next);
    onSelectedChange([]);
  }

  async function handleDeleteOne(id: string) {
    const next = await window.archiveApi.deleteInboxItems([id]);
    onDataChange(next);
    onSelectedChange(selected.filter((s) => s !== id));
  }

  async function handleClearAll() {
    const next = await window.archiveApi.clearInbox();
    onDataChange(next);
    onSelectedChange([]);
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">臨時入口</p>
          <h1>收件箱</h1>
          <p>先把散落文件放進來，再批量歸入項目和分類。</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={onImport}>
            <FileInput size={17} />
            導入文件
          </button>
          {data.inbox.length > 0 && (
            <button className="secondary" onClick={handleClearAll}>
              <Trash2 size={17} />
              清空全部
            </button>
          )}
        </div>
      </div>

      <div className="organize-bar">
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {data.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {data.settings.categories.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
        <div className="organize-bar-actions">
          <button className="primary" disabled={selected.length === 0 || !projectId} onClick={() => onOrganize(projectId, category)}>
            歸類已選 {selected.length}
          </button>
          {selected.length > 0 && (
            <button className="secondary compact-button" onClick={handleDeleteSelected}>
              <Trash2 size={15} />
              刪除已選
            </button>
          )}
        </div>
      </div>

      <div className="inbox-table">
        {data.inbox.length === 0 ? (
          <EmptyState title="收件箱是空的" body="導入桌面、下載或聊天軟件中的文件後，可以在這裡批量整理。" />
        ) : (
          data.inbox.map((item) => {
            const recommendedProject = data.projects.find((project) => project.id === item.recommendedProjectId);
            return (
              <div className="inbox-row" key={item.id}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                <div className="inbox-main">
                  <strong>{item.name}</strong>
                  <span>{item.sourcePath}</span>
                </div>
                <div className="recommend">
                  <span>{recommendedProject?.name || "未匹配項目"}</span>
                  <small>{item.recommendedCategory}</small>
                </div>
                <button
                  className="secondary compact-button"
                  disabled={!recommendedProject}
                  onClick={() => recommendedProject && onOrganize(recommendedProject.id, item.recommendedCategory, [item.id])}
                >
                  套用推薦
                </button>
                <button
                  className="icon-button inbox-delete-btn"
                  onClick={() => handleDeleteOne(item.id)}
                  title="從收件箱移除"
                  aria-label="刪除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ── SearchView ────────────────────────────────────────────

function SearchView({
  query,
  setQuery,
  results,
  onOpenProject
}: {
  query: string;
  setQuery: (query: string) => void;
  results: {
    projects: Project[];
    files: Array<{ name: string; path: string; category: string; projectName: string; size: number }>;
    inbox: InboxItem[];
  };
  onOpenProject: (project: Project) => void;
}) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">快速入口</p>
          <h1>全局搜索</h1>
          <p>按項目名、簡稱、標籤或文件名搜索，不需要記住資料夾路徑。</p>
        </div>
      </div>
      <div className="large-search">
        <Search size={22} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：支付、HIS、退款、接口、功能書" autoFocus />
      </div>

      {!query.trim() ? (
        <EmptyState title="輸入關鍵詞開始搜索" body="建議給項目設置別名和標籤，搜索會更接近你的記憶方式。" />
      ) : (
        <div className="search-sections">
          <ResultSection title="項目">
            {results.projects.map((project) => (
              <button className="result-row" key={project.id} onClick={() => onOpenProject(project)}>
                <FolderKanban size={18} />
                <span>{project.name}</span>
                <small>{project.alias || project.path}</small>
              </button>
            ))}
          </ResultSection>
          <ResultSection title="最近文件">
            {results.files.map((file) => (
              <button className="result-row" key={file.path} onClick={() => window.archiveApi.openFile(file.path)}>
                <FileInput size={18} />
                <span>{file.name}</span>
                <small>{file.projectName} / {file.category}</small>
              </button>
            ))}
          </ResultSection>
          <ResultSection title="收件箱">
            {results.inbox.map((item) => (
              <div className="result-row static" key={item.id}>
                <Inbox size={18} />
                <span>{item.name}</span>
                <small>{item.sourcePath}</small>
              </div>
            ))}
          </ResultSection>
        </div>
      )}
    </section>
  );
}

// ── SettingsView ──────────────────────────────────────────

function SettingsView({
  data,
  setData,
  registry,
  setRegistry,
  onRename,
  onDelete,
  onSwitch
}: {
  data: AppData;
  setData: (data: AppData) => void;
  registry: WorkspaceRegistry | null;
  setRegistry: (r: WorkspaceRegistry) => void;
  onRename: (workspaceId: string, currentName: string) => void;
  onDelete: (workspaceId: string, name: string) => void;
  onSwitch: (workspaceId: string) => void;
}) {
  async function chooseRoot() {
    const root = await window.archiveApi.selectRoot();
    if (root) setData(await window.archiveApi.updateRoot(root));
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">本地配置</p>
          <h1>設置</h1>
          <p>所有資料都保存在本機，項目文件夾由你指定。</p>
        </div>
      </div>
      <Panel title="工作目錄" icon={<FolderOpen size={18} />}>
        <div className="setting-row">
          <div>
            <strong title={data.settings.workspaceRoot || undefined}>{data.settings.workspaceRoot || "未設置"}</strong>
            <p>新建項目時，會在這個目錄下生成項目資料夾和標準分類。</p>
          </div>
          <button className="secondary" onClick={chooseRoot}>更換目錄</button>
        </div>
      </Panel>
      <Panel title="資料庫管理" icon={<Archive size={18} />}>
        {registry?.workspaces.map((ws) => (
          <div className="setting-row" key={ws.id}>
            <div>
              <strong>{ws.name}</strong>
              {ws.id === registry.activeWorkspaceId && <span className="badge">當前</span>}
            </div>
            <div className="setting-actions">
              {ws.id !== registry.activeWorkspaceId && (
                <button className="secondary compact-button" onClick={() => onSwitch(ws.id)}>
                  <Check size={14} />
                  切換
                </button>
              )}
              <button className="secondary compact-button" onClick={() => onRename(ws.id, ws.name)}>
                <Pencil size={14} />
                重命名
              </button>
              {ws.id !== registry.activeWorkspaceId && (
                <button className="secondary compact-button" onClick={() => onDelete(ws.id, ws.name)}>
                  <Trash2 size={14} />
                  刪除
                </button>
              )}
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="默認分類模板" icon={<Tags size={18} />}>
        <div className="category-grid">
          {data.settings.categories.map((category) => <div className="category-tile passive" key={category}>{category}</div>)}
        </div>
      </Panel>
    </section>
  );
}

// ── NewProjectDialog ──────────────────────────────────────

function NewProjectDialog({
  root,
  onClose,
  onCreated
}: {
  root: string;
  onClose: () => void;
  onCreated: (data: AppData) => void;
}) {
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(true);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = await window.archiveApi.createProject({
      name: name.trim(),
      alias: alias.trim(),
      tags: tags.split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean),
      pinned,
      root
    });
    onCreated(next);
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>新建項目</h2>
        <label>
          項目名稱
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：醫院支付系統改造" autoFocus />
        </label>
        <label>
          常用別名
          <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="例如：支付改造、門診支付" />
        </label>
        <label>
          標籤
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：HIS 支付 2026" />
        </label>
        <label className="check-line">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
          建立後置頂
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button className="primary" type="submit">建立項目</button>
        </div>
      </form>
    </div>
  );
}

// ── RenameWorkspaceDialog ─────────────────────────────────

function RenameWorkspaceDialog({
  currentName,
  onConfirm,
  onClose
}: {
  currentName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === currentName) { onClose(); return; }
    onConfirm(name.trim());
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>重命名資料庫</h2>
        <label>
          名稱
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button className="primary" type="submit" disabled={!name.trim()}>確定</button>
        </div>
      </form>
    </div>
  );
}

// ── ConfirmDeleteDialog ───────────────────────────────────

function ConfirmDeleteDialog({
  name,
  onConfirm,
  onClose
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>刪除資料庫</h2>
        <p>確定刪除「<strong>{name}</strong>」嗎？此操作無法撤銷，資料庫數據將永久丟失。</p>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>取消</button>
          <button className="primary danger" onClick={onConfirm}>確認刪除</button>
        </div>
      </div>
    </div>
  );
}

// ── 小組件 ────────────────────────────────────────────────

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <button className="project-card" onClick={onOpen}>
      <div>
        <strong>{project.name}</strong>
        <span>{project.alias}</span>
      </div>
      <div className="tag-row">
        {project.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
      </div>
      <small>最近：{formatDate(project.lastOpenedAt || project.updatedAt)}</small>
    </button>
  );
}

function Metric({ label, value, compact = false, tooltip }: { label: string; value: string; compact?: boolean; tooltip?: string }) {
  return (
    <div className={compact ? "metric compact" : "metric"}>
      <span>{label}</span>
      <strong title={tooltip}>{value}</strong>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title} icon={<Search size={18} />}>
      <div className="result-list">{children || <p className="muted">沒有匹配結果。</p>}</div>
    </Panel>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
