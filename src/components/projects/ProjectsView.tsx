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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "../../api";
import { setupDragDrop } from "../../utils";
import { getFileIcon } from "../../utils/fileIcon";
import type { AppData, CategoryFile, Language, Project } from "../../types";
import { ConfirmDangerDialog, RenameFileDialog } from "../../dialogs";
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
  rootDropHint: string;
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
  /** 来自 App 导航历史的当前分类(null 表示未指定,组件自行选第一个)。 */
  currentCategory?: string | null;
  /** 用户切换分类时通知 App 加 history;replace=true 时仅替换当前 entry(用于默认值)。 */
  onCategoryChange?: (next: string, replace?: boolean) => void;
  /** Spotlight 跳转到指定文件:滚动到该行 + 闪烁高亮。 */
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
  currentCategory,
  onCategoryChange,
  highlightFile,
}: ProjectsViewProps) {
  // 始终从 data.projects 中取最新的项目快照,避免父组件 activeProject 引用
  // 滞后于 setData 后的新 categories。
  const currentProject = useMemo(
    () => data.projects.find((p) => p.id === activeProject.id) ?? activeProject,
    [data.projects, activeProject],
  );
  const projectCategories = currentProject.categories;
  const [selectedCategory, setSelectedCategory] = useState(
    currentCategory || projectCategories[0] || ""
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
  // 当前正在拖动的文件(dnd-kit DragOverlay 用)
  const [activeDragFile, setActiveDragFile] = useState<CategoryFile | null>(null);
  // 同步 ref:spring-loaded 切换分类时原 FileRow 会被卸载,event.active.data 跟着失效,
  // 必须用 ref 保住 dragStart 时的 file 引用,dragEnd 才能拿到。
  const activeDragFileRef = useRef<CategoryFile | null>(null);
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // 拖拽碰撞检测:优先指针所在 droppable(嵌套/大小不一时更准),
  // 间隙处 fallback 到矩形相交,避免 over=null 时拖不到目标。
  const dndCollision = useCallback((args: Parameters<typeof pointerWithin>[0]) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : rectIntersection(args);
  }, []);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] =
    useState<CategoryFile | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [renamingFile, setRenamingFile] = useState<CategoryFile | null>(null);

  // ── Effects ──────────────────────────────────────────────

  // OS 外部拖入(整个 webview 范围):按指针位置路由到 category/folder/root。
  // 用 ref 拿最新 routeOsDrop,避免 closure stale。enter/leave 控制 isDraggingFiles 高亮。
  const addFilesRef = useRef<(paths?: string[]) => Promise<void>>(async () => {});
  const routeOsDropRef = useRef<
    (paths: string[], position: { x: number; y: number }) => Promise<void>
  >(async () => {});
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let cancelled = false;
    setupDragDrop({
      onEnter: () => setIsDraggingFiles(true),
      onLeave: () => setIsDraggingFiles(false),
      onDrop: (paths, position) => {
        if (!cancelled) void routeOsDropRef.current(paths, position);
      },
    })
      .then((u) => {
        if (cancelled) u();
        else unlistenFn = u;
      })
      .catch((err) => console.error("setupDragDrop failed:", err));
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  // 项目切换时：重置分类选择（用 categoriesKey 避免引用变化导致误触发）
  const categoriesKey = projectCategories.join(",");
  // 进入项目:重置分类选择/过滤/展开。只在切换项目时跑,避免分类列表变化时丢 UI 状态。
  useEffect(() => {
    setSelectedCategory(projectCategories[0] || "");
    setFileFilter("");
    setExpandedFolders(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject.id]);

  // 分类列表或外部文件变化时,刷新计数;若 selectedCategory 在新列表中不存在,切到第一个。
  useEffect(() => {
    if (!activeProject?.path) return;
    api
      .getCategoryCounts(activeProject.path, projectCategories)
      .then(setCategoryCounts)
      .catch(() => setCategoryCounts({}));
    if (selectedCategory && !projectCategories.includes(selectedCategory)) {
      setSelectedCategory(projectCategories[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path, categoriesKey, fileChangeEpoch]);

  // 进项目时 + 文件监视器触发时,主动从磁盘扫一级目录,把外部增删/重命名同步到 categories。
  useEffect(() => {
    if (!activeProject?.id) return;
    let cancelled = false;
    api
      .syncProjectCategories(activeProject.id)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, fileChangeEpoch]);

  // 导航历史 ↔ 本地 selectedCategory 双向同步
  // - props.currentCategory 变化(back/forward 或 Spotlight 跳转) → 同步到本地
  // - 本地切换分类 → 通知 App 加 history;首次同步用 replace 模式合并默认值
  const firstCategoryPush = useRef(true);
  useEffect(() => {
    if (currentCategory && currentCategory !== selectedCategory) {
      setSelectedCategory(currentCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCategory]);
  useEffect(() => {
    if (!onCategoryChange || !selectedCategory) return;
    if (selectedCategory === currentCategory) return;
    onCategoryChange(selectedCategory, firstCategoryPush.current);
    firstCategoryPush.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Spotlight 跳转到指定文件:分类切换 + 文件列表刷新完成后,
  // 在 DOM 里按 data-file-path 找到对应行 -> 滚动到视野中央 -> 加 pulse 动画
  useEffect(() => {
    if (!highlightFile) return;
    const path = highlightFile.path;
    // 子目录里的文件先展开父目录链,否则 DOM 里没有 data-file-path 节点
    const catRoot = `${activeProject.path}\\${selectedCategory}`;
    const lowerPath = path.toLowerCase();
    const lowerRoot = catRoot.toLowerCase();
    if (lowerPath.startsWith(lowerRoot)) {
      const rel = path.slice(catRoot.length).replace(/^[\\/]+/, "");
      const parts = rel.split(/[\\/]/);
      if (parts.length > 1) {
        const parents: string[] = [];
        let cur = catRoot;
        for (let i = 0; i < parts.length - 1; i++) {
          cur = `${cur}\\${parts[i]}`;
          parents.push(cur);
        }
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          parents.forEach((p) => next.add(p));
          return next;
        });
      }
    }
    // 文件列表是异步加载/重渲的,用 rAF + 短轮询等行节点出现(最多等 ~1.5s)
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
      // 等 expand 后子目录子项渲染,稍多给一些机会
      if (attempts < 40) window.setTimeout(tryLocate, 50);
    };
    // 初次延迟一帧,等 setSelectedCategory 与文件列表 useEffect 都跑过
    const t0 = window.setTimeout(tryLocate, 60);
    return () => {
      cancelled = true;
      clearTimeout(t0);
    };
  }, [highlightFile]);

  // (旧 effect 已合并到上方 categoriesKey/fileChangeEpoch effect,删除以避免双调 counts)


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
        .getCategoryCounts(activeProject.path, projectCategories)
        .then(setCategoryCounts)
        .catch(() => {});
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeProject, selectedCategory, projectCategories]);

  // ── Data ─────────────────────────────────────────────────

  async function refreshCategoryFiles() {
    if (!activeProject || !selectedCategory) return;
    setCategoryFiles(
      await api.listCategoryFiles(activeProject.path, selectedCategory)
    );
    api
      .getCategoryCounts(activeProject.path, projectCategories)
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
  // 每次 render 同步最新引用,供单次注册的 OS-drop listener 调用
  addFilesRef.current = addFilesToCategory;

  /** OS 外部拖入路由:根据指针位置找到 data-drop-target 元素,把文件加到对应位置。
   *  - category:X → 加到 X 分类根
   *  - folder:Y   → copy 到 Y 子文件夹
   *  - root / 未命中 → 加到当前 selectedCategory 根 */
  async function routeOsDrop(paths: string[], position: { x: number; y: number }) {
    if (!activeProject || paths.length === 0) return;
    const el = document.elementFromPoint(position.x, position.y);
    const targetEl = el?.closest("[data-drop-target]") as HTMLElement | null;
    const target = targetEl?.getAttribute("data-drop-target") ?? null;

    if (target?.startsWith("category:")) {
      const category = target.slice("category:".length);
      const next = await api.addFilesToCategory({
        projectId: activeProject.id,
        category,
        filePaths: paths,
      });
      setData(next);
      setSelectedCategory(category);
      // refresh 由 selectedCategory 变化的 useEffect 自动触发
    } else if (target?.startsWith("folder:")) {
      const folderPath = target.slice("folder:".length);
      try {
        for (const sourcePath of paths) {
          await api.copyFileTo({ sourcePath, targetPath: folderPath });
        }
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(folderPath);
          return next;
        });
        await refreshCategoryFiles();
      } catch (err) {
        console.error("OS drop to folder failed:", err);
      }
    } else {
      // root 或未命中 → 加到当前分类
      await addFilesToCategory(paths);
    }
  }
  // 同步最新引用给 setupDragDrop listener
  routeOsDropRef.current = routeOsDrop;

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
  /** 新增分类:物理 mkdir + sync(磁盘是真理源)。 */
  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setAddingCategory(false);
      return;
    }
    if (projectCategories.includes(name)) {
      setAddingCategory(false);
      setNewCategoryName("");
      setSelectedCategory(name);
      return;
    }
    try {
      const updated = await api.createProjectCategory(activeProject.id, name);
      setData(updated);
      setSelectedCategory(name);
    } catch (err) {
      window.alert(String(err));
    }
    setAddingCategory(false);
    setNewCategoryName("");
  }

  /** 删除分类:物理目录整体移到回收站,可在回收站恢复。 */
  async function deleteCategory(name: string) {
    try {
      const updated = await api.deleteProjectCategory(activeProject.id, name);
      setData(updated);
      if (selectedCategory === name) {
        const nextProject = updated.projects.find((p) => p.id === activeProject.id);
        setSelectedCategory(nextProject?.categories[0] || "");
      }
    } catch (err) {
      window.alert(String(err));
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

  /** 重命名分类:物理 rename + sync。 */
  async function submitRenameCategory() {
    const oldName = renamingCategory;
    if (!oldName) return;
    const newName = renameCategoryName.trim();
    if (!newName || newName === oldName) {
      cancelRenameCategory();
      return;
    }
    const exists = projectCategories.some(
      (c) => c.toLowerCase() === newName.toLowerCase() && c !== oldName,
    );
    if (exists) {
      window.alert(t.renameCategoryDuplicate.replace("{name}", newName));
      return;
    }
    try {
      const updated = await api.renameProjectCategory(
        activeProject.id,
        oldName,
        newName,
      );
      setData(updated);
      if (selectedCategory === oldName) setSelectedCategory(newName);
    } catch (err) {
      window.alert(String(err));
      return;
    }
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

  // ── dnd-kit 拖拽路由 ────────────────────────────────────
  //
  // FileRow 用 useDraggable(id=file.path, data={file})
  // category-row-wrap 用 useDroppable(id=`category:${name}`)
  // file-section 用 useDroppable(id=`folder:${folderPath}`)
  //
  // onDndDragOver 负责 spring-loaded folder(hover 0.5s 自动切换 selectedCategory)
  // onDndDragEnd 负责真正的 move 操作

  function clearCategoryHoverTimer() {
    if (categoryHoverTimerRef.current !== undefined) {
      window.clearTimeout(categoryHoverTimerRef.current);
      categoryHoverTimerRef.current = undefined;
    }
  }

  function onDndDragStart(event: DragStartEvent) {
    const file = event.active.data.current?.file as CategoryFile | undefined;
    if (file) {
      activeDragFileRef.current = file;
      setActiveDragFile(file);
    }
  }

  function onDndDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null;
    if (overId?.startsWith("category:")) {
      const category = overId.slice("category:".length);
      if (category !== selectedCategory && dragOverCategory !== category) {
        setDragOverCategory(category);
        clearCategoryHoverTimer();
        categoryHoverTimerRef.current = window.setTimeout(() => {
          setSelectedCategory(category);
          setDragOverCategory(null);
          categoryHoverTimerRef.current = undefined;
        }, 500);
      }
    } else if (dragOverCategory !== null) {
      setDragOverCategory(null);
      clearCategoryHoverTimer();
    }
  }

  async function onDndDragEnd(event: DragEndEvent) {
    // 优先用 ref(spring-loaded 卸载源 FileRow 后 event.active.data 会失效)
    const file =
      activeDragFileRef.current ??
      (event.active.data.current?.file as CategoryFile | undefined);
    const overId = event.over?.id ? String(event.over.id) : null;
    setActiveDragFile(null);
    activeDragFileRef.current = null;
    clearCategoryHoverTimer();
    setDragOverCategory(null);
    if (!file || !overId || !activeProject) return;

    // 同目录跳过(避免 backend rename 加 (1))
    const parentDir = parentPath(file.path).toLowerCase();

    if (overId.startsWith("category:")) {
      const category = overId.slice("category:".length);
      const targetDir = `${activeProject.path}\\${category}`;
      if (parentDir === targetDir.toLowerCase()) {
        // 文件已在该分类根目录,仅切换视图
        if (category !== selectedCategory) setSelectedCategory(category);
        return;
      }
      try {
        await api.moveFileTo({ sourcePath: file.path, targetPath: targetDir });
        setSelectedCategory(category);
      } catch (err) {
        console.error("Move to category failed:", err);
      }
    } else if (overId.startsWith("folder:")) {
      const folderPath = overId.slice("folder:".length);
      if (file.path === folderPath || file.isDirectory) return;
      if (parentDir === folderPath.toLowerCase()) return; // 已经在该子文件夹
      try {
        await api.moveFileTo({ sourcePath: file.path, targetPath: folderPath });
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(folderPath);
          return next;
        });
        await refreshCategoryFiles();
      } catch (err) {
        console.error("Move to folder failed:", err);
      }
    } else if (overId === "root") {
      // 拖回当前分类根目录
      if (!selectedCategory) return;
      const targetDir = `${activeProject.path}\\${selectedCategory}`;
      if (parentDir === targetDir.toLowerCase()) return; // 已经在分类根
      try {
        await api.moveFileTo({ sourcePath: file.path, targetPath: targetDir });
        await refreshCategoryFiles();
      } catch (err) {
        console.error("Move to root failed:", err);
      }
    }
  }

  function onDndDragCancel() {
    setActiveDragFile(null);
    activeDragFileRef.current = null;
    clearCategoryHoverTimer();
    setDragOverCategory(null);
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
    <DndContext
      sensors={dndSensors}
      collisionDetection={dndCollision}
      onDragStart={onDndDragStart}
      onDragOver={onDndDragOver}
      onDragEnd={onDndDragEnd}
      onDragCancel={onDndDragCancel}
    >
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
              {projectCategories.map((category) => {
                const isRenaming = renamingCategory === category;
                return (
                  <CategoryDropTarget
                    key={category}
                    category={category}
                    selectedCategory={selectedCategory}
                    dragOverCategory={dragOverCategory}
                    onContextMenu={(e) => {
                      if (isRenaming) return;
                      e.preventDefault();
                      setCategoryContextMenu({ x: e.clientX, y: e.clientY, category });
                    }}
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
                  </CategoryDropTarget>
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

            {/* 文件列表
                - 应用内拖拽:dnd-kit 管(RootDropTarget / FolderDropTarget / CategoryDropTarget)
                - OS 外部拖入:setupDragDrop 全局 listener → 总是加到当前 selectedCategory 根 */}
            <div
              className={
                isDraggingFiles ? "file-drop-zone dragging" : "file-drop-zone"
              }
            >
              {isDraggingFiles && <div className="drop-hint">{t.dragHint}</div>}
              {filteredFiles.length === 0 ? (
                <RootDropTarget>
                  <div className="root-drop-hint-inline">
                    {categoryFiles.length === 0 ? t.rootDropHint : t.noMatch}
                  </div>
                </RootDropTarget>
              ) : (
                <div
                  className={`file-table file-table-${fileScale} file-view-${fileViewMode}`}
                >
                  {/* 根目录文件(始终渲染为 root droppable,空时显示 hint) */}
                  <RootDropTarget>
                    {rootFiles.length > 0 ? (
                      <>
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
                      </>
                    ) : (
                      <div className="root-drop-hint-inline">
                        {t.rootDropHint}
                      </div>
                    )}
                  </RootDropTarget>

                  {/* 文件夹 */}
                  {folderSections.map((folder) => (
                    <FolderDropTarget
                      key={folder.path}
                      folderPath={folder.path}
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
                    </FolderDropTarget>
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
            <button
              className="context-menu-item"
              onClick={() => {
                setRenamingFile(contextMenu.file);
                setContextMenu(null);
              }}
            >
              <Pencil size={14} />
              重命名
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

      {/* 重命名文件/文件夹 */}
      {renamingFile && (
        <RenameFileDialog
          currentName={renamingFile.name}
          isDirectory={renamingFile.isDirectory}
          onConfirm={async (newName) => {
            await api.renameFileInPlace(renamingFile.path, newName);
            setRenamingFile(null);
            await refreshCategoryFiles();
          }}
          onClose={() => setRenamingFile(null)}
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
      <DragOverlay dropAnimation={null}>
        {activeDragFile && (
          <div className="dnd-overlay-ghost">
            {getFileIcon(activeDragFile.name, false, 16)}
            <span>{activeDragFile.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── FileRow 子组件 ──────────────────────────────────────────

interface FileRowProps {
  file: CategoryFile;
  fileViewMode: FileViewMode;
  fileScale: FileScale;
  index: number;
  isSelected: boolean;
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
  onContextMenu,
  onClick,
  onDoubleClick,
  onPreviewFile,
}: FileRowProps) {
  const icon = getFileIcon(file.name, file.isDirectory, fileViewMode === "grid" ? 32 : 16);
  // dnd-kit:仅非目录可拖。listeners 绑到根元素接收 pointerdown。
  // distance:5 activationConstraint(在 DndContext 顶层配)保证 click/dblclick 不被吞。
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: file.path,
    data: { file },
    disabled: file.isDirectory,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-file-path={file.path}
      className={`file-table-row file-scale-${fileScale} ${file.isDirectory ? "is-directory" : ""} ${isSelected ? "selected" : ""} ${isDragging ? "file-dragging" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY, file);
      }}
      onClick={(e) => onClick(file, index, e)}
      onDoubleClick={() => onDoubleClick(file)}
      style={{
        cursor: file.isDirectory ? "pointer" : "grab",
        userSelect: "none",
      }}
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
          onPointerDown={(e) => e.stopPropagation()}
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

function parentPath(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx >= 0 ? p.slice(0, idx) : "";
}

// ── CategoryDropTarget 子组件 ─────────────────────────────
//
// 用 useDroppable 接收 dnd-kit 拖来的文件。spring-loaded 切换由父组件的
// dragOverCategory state + onDndDragOver 里的 timer 处理。

interface CategoryDropTargetProps {
  category: string;
  selectedCategory: string;
  dragOverCategory: string | null;
  onContextMenu: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

function CategoryDropTarget({
  category,
  selectedCategory,
  dragOverCategory,
  onContextMenu,
  children,
}: CategoryDropTargetProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `category:${category}` });
  const isActive = category === selectedCategory;
  const showHover = (isOver || dragOverCategory === category) && !isActive;
  return (
    <div
      ref={setNodeRef}
      data-drop-target={`category:${category}`}
      className={
        (isActive ? "category-row-wrap active" : "category-row-wrap") +
        (showHover ? " category-drag-over" : "")
      }
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}

// ── FolderDropTarget 子组件 ───────────────────────────────
//
// dnd-kit useDroppable 接收应用内拖拽(file row → folder)。
// OS 外部拖入(系统拖文件)由顶层 setupDragDrop 全局 listener 统一加到当前分类根。

interface FolderDropTargetProps {
  folderPath: string;
  children: React.ReactNode;
}

function FolderDropTarget({ folderPath, children }: FolderDropTargetProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folderPath}` });
  return (
    <div
      ref={setNodeRef}
      data-drop-target={`folder:${folderPath}`}
      className={`file-section ${isOver ? "folder-drag-over" : ""}`}
    >
      {children}
    </div>
  );
}

// ── RootDropTarget 子组件 ─────────────────────────────────
//
// 当前分类的「根目录」drop target。包裹「根目录文件」区块或空提示。
// 与 FolderDropTarget 在 DOM 上互为兄弟,closestCenter collision 能正确路由:
// - 拖到 folder section 上 → folder droppable 命中
// - 拖到 root section 上(folder 之外) → root droppable 命中

function RootDropTarget({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "root" });
  return (
    <div
      ref={setNodeRef}
      data-drop-target="root"
      className={`file-section root-drop-section ${isOver ? "root-drag-over" : ""}`}
    >
      {children}
    </div>
  );
}
