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
    } catch (err) {
      console.error("Move failed:", err);
    }
    draggingFileRef.current = null;
    setDraggingFile(null);
    setDragOverFolder(null);
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
    const current = draggingFileRef.current;
    if (current && !current.isDirectory) {
      e.dataTransfer.dropEffect = "move";
      setDragOverFolder(folderPath);
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  }

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
              {data.settings.categories.map((category) => (
                <button
                  className={
                    category === selectedCategory
                      ? "category-row active"
                      : "category-row"
                  }
                  key={category}
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
              ))}
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
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropToFolder(folder.path);
                      }}
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
          message={`选中的 ${selectedFiles.size} 个文件会移入回收站，保留 30 天后自动永久删除。`}
          confirmLabel="删除"
          cancelLabel={t.migrateCancel}
          onConfirm={handleDeleteSelected}
          onClose={() => setBatchDeleteOpen(false)}
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
