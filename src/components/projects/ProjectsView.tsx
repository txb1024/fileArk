import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  LayoutList,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { api } from "../../api";
import { getDroppedFilePaths, setupDragDrop } from "../../utils";
import { getFileIcon } from "../../utils/fileIcon";
import type { AppData, CategoryFile, Language, Project } from "../../types";
import { ConfirmDangerDialog } from "../../dialogs";
import { EmptyState } from "../../components";
import { storage } from "../../utils";

type SortMode = "name" | "time" | "size";
type SortDirection = "asc" | "desc";
type FileScale = "compact" | "comfortable" | "large";
type FileViewMode = "list" | "grid";

interface Messages {
  categories: string;
  filterByName: string;
  openCategoryFolder: string;
  addFiles: string;
  newFolder: string;
  addCategory: string;
  deleteCategory: string;
  renameCategory: string;
  renameCategoryDuplicate: string;
  addCategoryPlaceholder: string;
  deleteCategoryConfirm: string;
  folderNamePrompt: string;
  name: string;
  modifiedAt: string;
  size: string;
  rootFiles: string;
  emptyCategory: string;
  noMatch: string;
  emptyCategoryBody: string;
  noMatchBody: string;
  dragHint: string;
  folder: string;
  openFile: string;
  previewFile: string;
  copyFile: string;
  deleteFile: string;
  deleteFileConfirm: string;
  migrateCancel: string;
}

interface ProjectsViewProps {
  data: AppData;
  setData: (data: AppData) => void;
  activeProject: Project;
  language: Language;
  t: Messages;
  copiedFile: { path: string; name: string } | null;
  onCopyFile: (file: { path: string; name: string } | null) => void;
  onPreviewFile: (path: string, name: string) => void;
  fileChangeEpoch: number;
  initialCategory?: { category: string; ts: number } | null;
  /** Spotlight 跳转到指定文件:滚动到该行 + 闪烁高亮(配合 initialCategory 一起改) */
  highlightFile?: { path: string; ts: number } | null;
}

export function ProjectsView({
  data,
  setData,
  activeProject,
  language,
  t,
  copiedFile,
  onCopyFile,
  onPreviewFile,
  fileChangeEpoch,
  initialCategory,
  highlightFile,
}: ProjectsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState(
    initialCategory?.category || data.settings.categories[0] || ""
  );
  const [categoryFiles, setCategoryFiles] = useState<CategoryFile[]>([]);
  const [fileFilter, setFileFilter] = useState("");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [fileScale, setFileScale] = useState<FileScale>(() =>
    storage.get("archive.fileScale", "comfortable" as FileScale)
  );
  const [fileViewMode, setFileViewMode] = useState<FileViewMode>(() =>
    storage.get("archive.fileViewMode", "list" as FileViewMode)
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: CategoryFile;
  } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [categoryCollapsed, setCategoryCollapsed] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<
    Record<string, number>
  >({});
  // 分类侧栏的新增/删除 UI 状态
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  // 分类右键菜单 + 重命名
  const [categoryContextMenu, setCategoryContextMenu] = useState<{
    x: number;
    y: number;
    category: string;
  } | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  // 拖文件到分类 item 上的高亮状态 + spring-loaded 自动切换 timer
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const categoryHoverTimerRef = useRef<number | undefined>(undefined);
  const [draggingFile, setDraggingFile] = useState<CategoryFile | null>(
    null
  );
  const draggingFileRef = useRef<CategoryFile | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] =
    useState<CategoryFile | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setupDragDrop(async (paths) => {
      if (!cancelled) await addFilesToCategory(paths);
    }).then((unlisten) => {
      if (!cancelled) return () => unlisten();
    });
    return () => { cancelled = true; };
  }, [activeProject, selectedCategory]);

  // 项目切换时：重置分类选择（用 categoriesKey 避免引用变化导致误触发）
  const categoriesKey = data.settings.categories.join(",");
  useEffect(() => {
    setSelectedCategory(data.settings.categories[0] || "");
    setFileFilter("");
    setExpandedFolders(new Set());
    if (activeProject?.path) {
      api
        .getCategoryCounts(activeProject.path, data.settings.categories)
        .then(setCategoryCounts)
        .catch(() => setCategoryCounts({}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject.id, categoriesKey]);

  // 搜索导航：initialCategory 变化时切换到指定分类（ts 确保每次搜索都触发）
  useEffect(() => {
    if (initialCategory?.category) {
      setSelectedCategory(initialCategory.category);
    }
  }, [initialCategory]);

  // Spotlight 跳转到指定文件:分类切换 + 文件列表刷新完成后,
  // 在 DOM 里按 data-file-path 找到对应行 -> 滚动到视野中央 -> 加 pulse 动画
  useEffect(() => {
    if (!highlightFile) return;
    const path = highlightFile.path;
    // 文件列表是异步加载/重渲的,用 rAF + 短轮询等行节点出现(最多等 ~1s)
    let cancelled = false;
    let attempts = 0;
    const escapeAttr = (s: string) => s.replace(/["\\]/g, "\\$&");

    const tryLocate = () => {
      if (cancelled) return;
      const row = document.querySelector<HTMLElement>(
        `[data-file-path="${escapeAttr(path)}"]`,
      );
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        // 先移除旧的(若上次还没结束)再加,触发动画重新跑
        row.classList.remove("spotlight-pulse");
        // 强制 reflow,让 remove + add 之间不会被浏览器合批
        void row.offsetWidth;
        row.classList.add("spotlight-pulse");
        window.setTimeout(() => {
          row.classList.remove("spotlight-pulse");
        }, 1500);
        return;
      }
      attempts += 1;
      if (attempts < 30) window.setTimeout(tryLocate, 50);
    };
    // 初次延迟一帧,等 setSelectedCategory 与文件列表 useEffect 都跑过
    const t0 = window.setTimeout(tryLocate, 60);
    return () => {
      cancelled = true;
      clearTimeout(t0);
    };
  }, [highlightFile]);

  // 文件变更时：仅刷新分类计数，不重置选中分类
  useEffect(() => {
    if (activeProject?.path) {
      api
        .getCategoryCounts(activeProject.path, data.settings.categories)
        .then(setCategoryCounts)
        .catch(() => setCategoryCounts({}));
    }
  }, [activeProject?.path, categoriesKey, fileChangeEpoch]);

  useEffect(() => {
    storage.set("archive.fileScale", fileScale);
    storage.set("archive.fileViewMode", fileViewMode);
  }, [fileScale, fileViewMode]);

  useEffect(() => {
    if (!activeProject || !selectedCategory) {
      setCategoryFiles([]);
      return;
    }
    api
      .listCategoryFiles(activeProject.path, selectedCategory)
      .then(setCategoryFiles);
  }, [activeProject, selectedCategory, fileChangeEpoch]);

  // 窗口聚焦时静默刷新当前分类文件
  useEffect(() => {
    function onFocus() {
      if (!activeProject || !selectedCategory) return;
      api
        .listCategoryFiles(activeProject.path, selectedCategory)
        .then(setCategoryFiles);
      api
        .getCategoryCounts(activeProject.path, data.settings.categories)
        .then(setCategoryCounts)
        .catch(() => {});
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeProject, selectedCategory, data.settings.categories]);

  // ── External drop handler ────────────────────────────────

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingFiles(false);
    const paths = getDroppedFilePaths(e);
    if (paths.length > 0) addFilesToCategory(paths);
  }

  // ── Data ─────────────────────────────────────────────────

  async function refreshCategoryFiles() {
    if (!activeProject || !selectedCategory) return;
    setCategoryFiles(
      await api.listCategoryFiles(activeProject.path, selectedCategory)
    );
    api
      .getCategoryCounts(activeProject.path, data.settings.categories)
      .then(setCategoryCounts)
      .catch(() => {});
  }

  async function addFilesToCategory(filePaths?: string[]) {
    if (!activeProject || !selectedCategory) return;
    const files = filePaths || (await api.selectFiles());
    if (files.length === 0) return;
    const next = await api.addFilesToCategory({
      projectId: activeProject.id,
      category: selectedCategory,
      filePaths: files,
    });
    setData(next);
    await refreshCategoryFiles();
  }

  async function createFolderInCategory() {
    if (!activeProject || !selectedCategory || !newFolderName.trim()) return;
    await api.createCategoryFolder({
      projectId: activeProject.id,
      category: selectedCategory,
      folderName: newFolderName.trim(),
    });
    setCategoryFiles(
      await api.listCategoryFiles(activeProject.path, selectedCategory)
    );
    setNewFolderName("");
  }

  /** 新增分类:加到全局 categories 末尾,所有项目可见。物理目录在进入分类时按需创建。 */
  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setAddingCategory(false);
      return;
    }
    const existing = data.settings.categories;
    if (existing.includes(name)) {
      setAddingCategory(false);
      setNewCategoryName("");
      setSelectedCategory(name);
      return;
    }
    const updated = await api.updateCategories([...existing, name]);
    setData(updated);
    setAddingCategory(false);
    setNewCategoryName("");
    setSelectedCategory(name);
  }

  /** 删除分类:只从全局 categories 移除,磁盘文件夹和文件保留(避免误删用户数据)。 */
  async function deleteCategory(name: string) {
    const next = data.settings.categories.filter((c) => c !== name);
    const updated = await api.updateCategories(next);
    setData(updated);
    if (selectedCategory === name) {
      setSelectedCategory(updated.settings.categories[0] || "");
    }
    setConfirmDeleteCategory(null);
  }

  function startRenameCategory(name: string) {
    setRenamingCategory(name);
    setRenameCategoryName(name);
  }

  function cancelRenameCategory() {
    setRenamingCategory(null);
    setRenameCategoryName("");
  }

  /** 重命名分类:同名(忽略大小写)报错,空名/未变化静默取消。
   *  只改全局列表;磁盘上的旧物理目录保留,避免误删用户文件。 */
  async function submitRenameCategory() {
    const oldName = renamingCategory;
    if (!oldName) return;
    const newName = renameCategoryName.trim();
    if (!newName || newName === oldName) {
      cancelRenameCategory();
      return;
    }
    const exists = data.settings.categories.some(
      (c) => c.toLowerCase() === newName.toLowerCase() && c !== oldName,
    );
    if (exists) {
      window.alert(t.renameCategoryDuplicate.replace("{name}", newName));
      // 保留输入框让用户改
      return;
    }
    const next = data.settings.categories.map((c) => (c === oldName ? newName : c));
    const updated = await api.updateCategories(next);
    setData(updated);
    if (selectedCategory === oldName) setSelectedCategory(newName);
    cancelRenameCategory();
  }

  /** 右键「打开目录文件」:在系统资源管理器中打开 {project.path}/{category}。
   *  open_folder 命令会按需创建,所以即便没建过也能正常打开。 */
  async function openCategoryFolderInSystem(category: string) {
    if (!activeProject) return;
    const path = `${activeProject.path}\\${category}`;
    await api.openFolder(path);
  }

  async function handlePasteFile(targetPath: string) {
    if (!copiedFile) return;
    await api.copyFileTo({ sourcePath: copiedFile.path, targetPath });
    onCopyFile(null);
    await refreshCategoryFiles();
  }

  async function handleDropToFolder(targetPath: string) {
    const currentDraggingFile = draggingFileRef.current;
    if (!currentDraggingFile || !activeProject || !selectedCategory) return;
    if (currentDraggingFile.path === targetPath) return;
    try {
      await api.moveFileTo({
        sourcePath: currentDraggingFile.path,
        targetPath,
      });
      await refreshCategoryFiles();
      // 移成功后展开目标文件夹,让用户看到刚拖进去的文件
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(targetPath);
        return next;
      });
    } catch (err) {
      console.error("Move failed:", err);
    }
    draggingFileRef.current = null;
    setDraggingFile(null);
    setDragOverFolder(null);
  }

  /** 处理子文件夹上的 drop:
   *  - 拖入外部文件(系统拖进来) → 逐个 copy 到子文件夹
   *  - 拖动列表内文件 → 复用 handleDropToFolder 移动
   *  事件已 stopPropagation 防止冒泡到外层 file-panel(否则会走 addFilesToCategory 加到分类根) */
  async function handleAnyDropToFolder(e: React.DragEvent, targetPath: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    setIsDraggingFiles(false);
    const externalPaths = getDroppedFilePaths(e);
    if (externalPaths.length > 0) {
      try {
        for (const sourcePath of externalPaths) {
          await api.copyFileTo({ sourcePath, targetPath });
        }
        await refreshCategoryFiles();
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(targetPath);
          return next;
        });
      } catch (err) {
        console.error("Copy to folder failed:", err);
      }
      return;
    }
    await handleDropToFolder(targetPath);
  }

  // ── Drag & Drop ─────────────────────────────────────────

  function handleDragStart(file: CategoryFile) {
    draggingFileRef.current = file;
    setDraggingFile(file);
  }

  function handleDragEnd() {
    draggingFileRef.current = null;
    setDraggingFile(null);
    setDragOverFolder(null);
  }

  function handleDragOver(
    e: React.DragEvent,
    folderPath: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const current = draggingFileRef.current;
    // 内部拖动:仅文件可拖到子文件夹(目录不能拖到目录里)
    if (current) {
      if (!current.isDirectory && current.path !== folderPath) {
        e.dataTransfer.dropEffect = "move";
        setDragOverFolder(folderPath);
      } else {
        e.dataTransfer.dropEffect = "none";
      }
      return;
    }
    // 外部拖入(系统拖进来的文件):dataTransfer 有 file 类型
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
      setDragOverFolder(folderPath);
    }
  }

  // ── 拖文件到「分类 item」(左侧侧栏)──────────────────────
  //
  // 行为:
  // - hover 在分类 item 上 500ms 自动切换 selectedCategory(spring-loaded folder),
  //   切换后用户可以继续往那个分类的子文件夹里拖
  // - 直接 drop 在分类 item 上 → 文件移动到该分类的物理根目录,并切换视图
  // 只接受内部拖动(file row),不在 toolbar 上接受外部 OS 拖入

  function clearCategoryHoverTimer() {
    if (categoryHoverTimerRef.current !== undefined) {
      window.clearTimeout(categoryHoverTimerRef.current);
      categoryHoverTimerRef.current = undefined;
    }
  }

  function handleCategoryDragOver(e: React.DragEvent, category: string) {
    const current = draggingFileRef.current;
    if (!current || current.isDirectory) return;
    // 不允许拖到当前已选中的分类(本来就在这里)
    if (category === selectedCategory) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCategory !== category) {
      setDragOverCategory(category);
      clearCategoryHoverTimer();
      categoryHoverTimerRef.current = window.setTimeout(() => {
        setSelectedCategory(category);
        // 切换后清掉高亮(此时它已变 active)
        setDragOverCategory(null);
        categoryHoverTimerRef.current = undefined;
      }, 500);
    }
  }

  function handleCategoryDragLeave() {
    clearCategoryHoverTimer();
    setDragOverCategory(null);
  }

  async function handleCategoryDrop(e: React.DragEvent, category: string) {
    const current = draggingFileRef.current;
    if (!current || !activeProject) return;
    clearCategoryHoverTimer();
    setDragOverCategory(null);
    if (category === selectedCategory) return;
    e.preventDefault();
    e.stopPropagation();
    // 目标 = 该分类的物理根目录,backend 会按需创建
    const targetPath = `${activeProject.path}\\${category}`;
    try {
      await api.moveFileTo({ sourcePath: current.path, targetPath });
      setSelectedCategory(category);
      // refresh 在 selectedCategory 变化的 useEffect 里会自动触发
    } catch (err) {
      console.error("Move to category failed:", err);
    }
    draggingFileRef.current = null;
    setDraggingFile(null);
  }

  // 组件卸载时清掉 timer,避免 setSelectedCategory on unmounted
  useEffect(() => {
    return () => clearCategoryHoverTimer();
  }, []);

  function toggleFolderExpanded(folderPath: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderPath) ? next.delete(folderPath) : next.add(folderPath);
      return next;
    });
  }

  // ── Helpers ─────────────────────────────────────────────

  const sortFiles = (files: CategoryFile[]) =>
    [...files].sort((a, b) => {
      let result = 0;
      if (sortMode === "time")
        result =
          new Date(a.modifiedAt).getTime() -
          new Date(b.modifiedAt).getTime();
      else if (sortMode === "size") result = a.size - b.size;
      else
        result = a.name.localeCompare(b.name, language === "zh" ? "zh-Hans" : "en", {
          numeric: true,
          sensitivity: "base",
        });
      return sortDirection === "desc" ? -result : result;
    });

  const matchesFilter = (file: CategoryFile) =>
    file.name.toLowerCase().includes(fileFilter.trim().toLowerCase());

  const filteredFiles = sortFiles(
    categoryFiles.filter(
      (file) =>
        matchesFilter(file) || file.children?.some(matchesFilter)
    )
  );
  const rootFiles = filteredFiles.filter(
    (file) => !file.isDirectory && matchesFilter(file)
  );
  const folderSections = filteredFiles
    .filter((file) => file.isDirectory)
    .map((folder) => ({
      ...folder,
      children: sortFiles((folder.children || []).filter(matchesFilter)),
    }));

  // ── 选择逻辑 ────────────────────────────────────────────

  // 构建所有可见文件的扁平列表（用于范围选择）
  const allVisibleFiles = useMemo(() => {
    const list: CategoryFile[] = [];
    rootFiles.forEach((f) => list.push(f));
    folderSections.forEach((folder) => {
      list.push(folder);
      (folder.children || []).forEach((f) => list.push(f));
    });
    return list;
  }, [rootFiles, folderSections]);

  function clearSelection() {
    setSelectedFiles(new Set());
    setLastSelectedIndex(null);
  }

  function handleFileClick(file: CategoryFile, index: number, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: 切换单个
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        next.has(file.path) ? next.delete(file.path) : next.add(file.path);
        return next;
      });
      setLastSelectedIndex(index);
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      // Shift+Click: 范围选择
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const paths = allVisibleFiles.slice(start, end + 1).map((f) => f.path);
      setSelectedFiles(new Set(paths));
    } else {
      setSelectedFiles(new Set([file.path]));
      setLastSelectedIndex(index);
    }
  }

  function handleFileDoubleClick(file: CategoryFile) {
    clearSelection();
    if (file.isDirectory) {
      toggleFolderExpanded(file.path);
    } else {
      onPreviewFile(file.path, file.name);
    }
  }

  async function handleDeleteSelected() {
    if (selectedFiles.size === 0) return;
    for (const path of selectedFiles) {
      await api
        .deleteFile(path, {
          projectId: activeProject.id,
          projectName: activeProject.name,
          category: selectedCategory,
        })
        .catch(() => {});
    }
    clearSelection();
    await refreshCategoryFiles();
    setBatchDeleteOpen(false);
  }

  function handleCopySelected() {
    if (selectedFiles.size === 0) return;
    // 复制第一个选中的文件（后续可扩展到多文件）
    const firstPath = [...selectedFiles][0];
    const file = allVisibleFiles.find((f) => f.path === firstPath);
    if (file && !file.isDirectory) {
      onCopyFile({ path: file.path, name: file.name });
    }
    clearSelection();
  }

  // 键盘快捷键
  function handleFilePanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      clearSelection();
    }
    if (e.key === "Delete" && selectedFiles.size > 0) {
      e.preventDefault();
      setBatchDeleteOpen(true);
    }
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <section className="page projects-page">
      <div className="project-detail">
        <div
          className={`workspace-grid ${categoryCollapsed ? "category-collapsed" : ""}`}
        >
          {/* 分类侧边栏 */}
          <div
            className={`project-list-panel category-side-panel ${categoryCollapsed ? "collapsed" : ""}`}
          >
            <div className="panel-mini-title">
              {!categoryCollapsed && t.categories}
              <button
                className="collapse-btn"
                onClick={() => setCategoryCollapsed(!categoryCollapsed)}
              >
                {categoryCollapsed ? (
                  <ChevronRight size={16} />
                ) : (
                  <ChevronLeft size={16} />
                )}
              </button>
            </div>
            <div className="category-list">
              {data.settings.categories.map((category) => {
                const isRenaming = renamingCategory === category;
                return (
                  <div
                    key={category}
                    className={
                      (category === selectedCategory
                        ? "category-row-wrap active"
                        : "category-row-wrap") +
                      (dragOverCategory === category ? " category-drag-over" : "")
                    }
                    onContextMenu={(e) => {
                      if (isRenaming) return;
                      e.preventDefault();
                      setCategoryContextMenu({ x: e.clientX, y: e.clientY, category });
                    }}
                    onDragOver={(e) => handleCategoryDragOver(e, category)}
                    onDragLeave={handleCategoryDragLeave}
                    onDrop={(e) => void handleCategoryDrop(e, category)}
                  >
                    {isRenaming ? (
                      <input
                        className="category-add-input"
                        value={renameCategoryName}
                        onChange={(e) => setRenameCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitRenameCategory();
                          if (e.key === "Escape") cancelRenameCategory();
                        }}
                        onBlur={() => void submitRenameCategory()}
                        autoFocus
                      />
                    ) : (
                      <button
                        className={
                          category === selectedCategory
                            ? "category-row active"
                            : "category-row"
                        }
                        onClick={() => setSelectedCategory(category)}
                      >
                        <span>
                          <FolderOpen size={18} />
                          {category}
                        </span>
                        {categoryCounts[category] > 0 && (
                          <small>{categoryCounts[category]}</small>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              {!categoryCollapsed && (
                addingCategory ? (
                  <div className="category-row-wrap adding">
                    <input
                      className="category-add-input"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addCategory();
                        if (e.key === "Escape") {
                          setAddingCategory(false);
                          setNewCategoryName("");
                        }
                      }}
                      onBlur={() => void addCategory()}
                      placeholder={t.addCategoryPlaceholder}
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    className="category-add-btn"
                    onClick={() => {
                      setAddingCategory(true);
                      setNewCategoryName("");
                    }}
                  >
                    <Plus size={14} />
                    <span>{t.addCategory}</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* 文件面板 */}
          <section className="panel" onKeyDown={handleFilePanelKeyDown} tabIndex={-1}>
            <div className="panel-title">
              <h2>{selectedCategory || t.name}</h2>
            </div>

            {/* 批量选择操作栏（隐藏，选中操作通过右键菜单进行） */}

            {/* 工具栏 */}
            <div className="file-toolbar">
              <div className="inline-search">
                <Search size={16} />
                <input
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder={t.filterByName}
                />
                {fileFilter && (
                  <button
                    className="icon-button"
                    onClick={() => setFileFilter("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="toolbar-display-group">
                <div className="view-toggle-group">
                  <button
                    className={`view-toggle-btn ${fileViewMode === "list" ? "active" : ""}`}
                    onClick={() => setFileViewMode("list")}
                    title="列表"
                  >
                    <LayoutList size={16} />
                  </button>
                  <button
                    className={`view-toggle-btn ${fileViewMode === "grid" ? "active" : ""}`}
                    onClick={() => setFileViewMode("grid")}
                    title="网格"
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>
                <div className="view-toggle-group">
                  <button
                    className={`view-toggle-btn ${fileScale === "compact" ? "active" : ""}`}
                    onClick={() => setFileScale("compact")}
                    title="紧凑"
                  >S</button>
                  <button
                    className={`view-toggle-btn ${fileScale === "comfortable" ? "active" : ""}`}
                    onClick={() => setFileScale("comfortable")}
                    title="舒适"
                  >M</button>
                  <button
                    className={`view-toggle-btn ${fileScale === "large" ? "active" : ""}`}
                    onClick={() => setFileScale("large")}
                    title="宽松"
                  >L</button>
                </div>
              </div>
              <button
                className="icon-button folder-icon-button"
                onClick={() =>
                  api.openFolder(
                    `${activeProject.path}\\${selectedCategory}`
                  )
                }
                title={t.openCategoryFolder}
              >
                <FolderOpen size={16} />
              </button>
              <div className="new-folder-control">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createFolderInCategory();
                  }}
                  placeholder={t.folderNamePrompt}
                />
              </div>
              <button
                className="secondary icon-text-button"
                onClick={createFolderInCategory}
                disabled={!newFolderName.trim()}
              >
                <FolderPlus size={16} />
                {t.newFolder}
              </button>
              <button className="primary" onClick={() => addFilesToCategory()}>
                <Plus size={16} />
                {t.addFiles}
              </button>
            </div>

            {/* 表头 */}
            <div className="file-table-head">
              <span
                className={`sortable-header ${sortMode === "name" ? "active" : ""}`}
                onClick={() => {
                  setSortMode("name");
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                }}
              >
                {t.name}{" "}
                {sortMode === "name" && (sortDirection === "asc" ? " ↑" : " ↓")}
              </span>
              <span
                className={`sortable-header ${sortMode === "time" ? "active" : ""}`}
                onClick={() => {
                  setSortMode("time");
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                }}
              >
                {t.modifiedAt}{" "}
                {sortMode === "time" && (sortDirection === "asc" ? " ↑" : " ↓")}
              </span>
              <span
                className={`sortable-header ${sortMode === "size" ? "active" : ""}`}
                onClick={() => {
                  setSortMode("size");
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                }}
              >
                {t.size}{" "}
                {sortMode === "size" && (sortDirection === "asc" ? " ↑" : " ↓")}
              </span>
            </div>

            {/* 文件列表 */}
            <div
              className={
                isDraggingFiles
                  ? "file-drop-zone dragging"
                  : "file-drop-zone"
              }
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDraggingFiles(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setIsDraggingFiles(false);
              }}
              onDrop={handleFileDrop}
            >
              {isDraggingFiles && <div className="drop-hint">{t.dragHint}</div>}
              {filteredFiles.length === 0 ? (
                <EmptyState
                    title={categoryFiles.length === 0 ? t.emptyCategory : t.noMatch}
                    body={categoryFiles.length === 0 ? t.emptyCategoryBody : t.noMatchBody}
                  />
              ) : (
                <div
                  className={`file-table file-table-${fileScale} file-view-${fileViewMode}`}
                >
                  {/* 根目录文件 */}
                  {rootFiles.length > 0 && (
                    <div className="file-section">
                      <div className="file-section-title">{t.rootFiles}</div>
                      <div className={`file-items file-items-${fileViewMode}`}>
                        {rootFiles.map((file) => {
                          const idx = allVisibleFiles.findIndex((f) => f.path === file.path);
                          return (
                            <FileRow
                              key={file.path}
                              file={file}
                              fileViewMode={fileViewMode}
                              fileScale={fileScale}
                              index={idx}
                              isSelected={selectedFiles.has(file.path)}
                              draggingFile={draggingFile}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onContextMenu={(x, y, f) =>
                                setContextMenu({ x, y, file: f })
                              }
                              onClick={handleFileClick}
                              onDoubleClick={handleFileDoubleClick}
                              onPreviewFile={onPreviewFile}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 文件夹 */}
                  {folderSections.map((folder) => (
                    <div
                      key={folder.path}
                      className={`file-section ${dragOverFolder === folder.path ? "folder-drag-over" : ""}`}
                      onDragOver={(e) => handleDragOver(e, folder.path)}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={(e) => handleAnyDropToFolder(e, folder.path)}
                    >
                      <div
                        className="file-section-title"
                        onClick={() => toggleFolderExpanded(folder.path)}
                        style={{ cursor: "pointer" }}
                      >
                        <span>
                          <span className="folder-expand-icon">
                            {expandedFolders.has(folder.path) ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </span>
                          <Folder
                            size={14}
                            style={{ marginRight: 6, opacity: 0.7 }}
                          />
                          {folder.name}
                        </span>
                        <div className="file-section-actions">
                          {copiedFile && (
                            <button
                              className="icon-button"
                              onClick={() => handlePasteFile(folder.path)}
                            >
                              <Download
                                size={14}
                                style={{ transform: "rotate(180deg)" }}
                              />
                            </button>
                          )}
                          <button
                            className="icon-button"
                            onClick={() => api.openFolder(folder.path)}
                            title={t.folder}
                          >
                            <FolderOpen size={16} />
                          </button>
                        </div>
                      </div>
                      {expandedFolders.has(folder.path) && (
                        <div
                          className={`file-items file-items-${fileViewMode}`}
                        >
                          {(folder.children || []).map((file) => {
                            const idx = allVisibleFiles.findIndex((f) => f.path === file.path);
                            return (
                              <FileRow
                                key={file.path}
                                file={file}
                                fileViewMode={fileViewMode}
                                fileScale={fileScale}
                                index={idx}
                                isSelected={selectedFiles.has(file.path)}
                                draggingFile={draggingFile}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onContextMenu={(x, y, f) =>
                                  setContextMenu({ x, y, file: f })
                                }
                                onClick={handleFileClick}
                                onDoubleClick={handleFileDoubleClick}
                                onPreviewFile={onPreviewFile}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="context-menu-overlay"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="context-menu-item"
              onClick={() => {
                if (contextMenu.file.isDirectory) {
                  api.openFolder(contextMenu.file.path);
                } else {
                  api.openFile(contextMenu.file.path);
                }
                setContextMenu(null);
              }}
            >
              <FolderOpen size={14} />
              {t.openFile}
            </button>
            {!contextMenu.file.isDirectory && onPreviewFile && (
              <button
                className="context-menu-item"
                onClick={() => {
                  onPreviewFile(
                    contextMenu.file.path,
                    contextMenu.file.name
                  );
                  setContextMenu(null);
                }}
              >
                <Eye size={14} />
                {t.previewFile}
              </button>
            )}
            <div className="context-menu-divider" />
            <button
              className="context-menu-item"
              onClick={() => {
                onCopyFile({
                  path: contextMenu.file.path,
                  name: contextMenu.file.name,
                });
                setContextMenu(null);
              }}
            >
              <Copy size={14} />
              {t.copyFile}
            </button>
            {!contextMenu.file.isDirectory && (
              <button
                className="context-menu-item danger-text"
                onClick={() => {
                  setPendingDeleteFile(contextMenu.file);
                  setDeleteConfirmOpen(true);
                  setContextMenu(null);
                }}
              >
                <Trash2 size={14} />
                {t.deleteFile}
              </button>
            )}
            {selectedFiles.size > 1 && (
              <>
                <div className="context-menu-divider" />
                <button
                  className="context-menu-item danger-text"
                  onClick={() => {
                    setBatchDeleteOpen(true);
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  删除选中的 {selectedFiles.size} 个文件
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* 分类右键菜单 */}
      {categoryContextMenu && (
        <>
          <div
            className="context-menu-overlay"
            onClick={() => setCategoryContextMenu(null)}
          />
          <div
            className="context-menu"
            style={{ left: categoryContextMenu.x, top: categoryContextMenu.y }}
          >
            <button
              className="context-menu-item"
              onClick={() => {
                openCategoryFolderInSystem(categoryContextMenu.category);
                setCategoryContextMenu(null);
              }}
            >
              <FolderOpen size={14} />
              {t.openCategoryFolder}
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                startRenameCategory(categoryContextMenu.category);
                setCategoryContextMenu(null);
              }}
            >
              <Pencil size={14} />
              {t.renameCategory}
            </button>
            <div className="context-menu-divider" />
            <button
              className="context-menu-item danger-text"
              onClick={() => {
                setConfirmDeleteCategory(categoryContextMenu.category);
                setCategoryContextMenu(null);
              }}
            >
              <Trash2 size={14} />
              {t.deleteCategory}
            </button>
          </div>
        </>
      )}

      {/* 删除确认 */}
      {deleteConfirmOpen && pendingDeleteFile && (
        <ConfirmDangerDialog
          title={t.deleteFile}
          message={t.deleteFileConfirm}
          confirmLabel={t.deleteFile}
          cancelLabel={t.migrateCancel}
          onConfirm={async () => {
            await api.deleteFile(pendingDeleteFile.path, {
              projectId: activeProject.id,
              projectName: activeProject.name,
              category: selectedCategory,
            });
            await refreshCategoryFiles();
            setDeleteConfirmOpen(false);
            setPendingDeleteFile(null);
          }}
          onClose={() => {
            setDeleteConfirmOpen(false);
            setPendingDeleteFile(null);
          }}
        />
      )}

      {/* 批量删除确认 */}
      {batchDeleteOpen && (
        <ConfirmDangerDialog
          title="批量删除"
          message={`选中的 ${selectedFiles.size} 个文件会移入回收站,保留 30 天后自动永久删除。`}
          confirmLabel="删除"
          cancelLabel={t.migrateCancel}
          onConfirm={handleDeleteSelected}
          onClose={() => setBatchDeleteOpen(false)}
        />
      )}

      {/* 删除分类确认 — 只从全局列表移除,不动磁盘文件 */}
      {confirmDeleteCategory && (
        <ConfirmDangerDialog
          title={t.deleteCategory}
          message={t.deleteCategoryConfirm.replace("{name}", confirmDeleteCategory)}
          confirmLabel={t.deleteCategory}
          cancelLabel={t.migrateCancel}
          onConfirm={() => deleteCategory(confirmDeleteCategory)}
          onClose={() => setConfirmDeleteCategory(null)}
        />
      )}
    </section>
  );
}

// ── FileRow 子组件 ──────────────────────────────────────────

interface FileRowProps {
  file: CategoryFile;
  fileViewMode: FileViewMode;
  fileScale: FileScale;
  index: number;
  isSelected: boolean;
  draggingFile: CategoryFile | null;
  onDragStart: (file: CategoryFile) => void;
  onDragEnd: () => void;
  onContextMenu: (x: number, y: number, file: CategoryFile) => void;
  onClick: (file: CategoryFile, index: number, e: React.MouseEvent) => void;
  onDoubleClick: (file: CategoryFile) => void;
  onPreviewFile: (path: string, name: string) => void;
}

function FileRow({
  file,
  fileViewMode,
  fileScale,
  index,
  isSelected,
  draggingFile,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onClick,
  onDoubleClick,
  onPreviewFile,
}: FileRowProps) {
  const icon = getFileIcon(file.name, file.isDirectory, fileViewMode === "grid" ? 32 : 16);
  return (
    <div
      data-file-path={file.path}
      className={`file-table-row file-scale-${fileScale} ${file.isDirectory ? "is-directory" : ""} ${isSelected ? "selected" : ""} ${draggingFile?.path === file.path ? "file-dragging" : ""}`}
      draggable={!file.isDirectory}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(file);
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY, file);
      }}
      onClick={(e) => onClick(file, index, e)}
      onDoubleClick={() => onDoubleClick(file)}
      style={{ cursor: "pointer", userSelect: "none" }}
    >
      <div className="file-name-cell">
        <span className="file-icon">{icon}</span>
        <span className="file-name-text">{file.name}</span>
      </div>
      {fileViewMode === "list" && (
        <>
          <small>
            {new Date(file.modifiedAt).toLocaleDateString()}
          </small>
          <small>{formatSize(file.size)}</small>
        </>
      )}
      {!file.isDirectory && (
        <button
          className="icon-button preview-btn"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewFile(file.path, file.name);
          }}
        >
          <Eye size={14} />
        </button>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
