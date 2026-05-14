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
} from "lucide-react";
import { api } from "../../api";
import { getDroppedFilePaths, setupDragDrop } from "../../utils";
import type { AppData, CategoryFile, Language, Project } from "../../types";
import { ConfirmDangerDialog } from "../../dialogs";
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
}: ProjectsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState(
    data.settings.categories[0] || ""
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] =
    useState<CategoryFile | null>(null);

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
  }, [activeProject.id, data.settings.categories]);

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
  }, [activeProject, selectedCategory]);

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
          <section className="panel">
            <div className="panel-title">
              <FolderOpen size={18} />
              <h2>{selectedCategory || t.name}</h2>
            </div>

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
              <div className="view-toggle-group">
                <button
                  className={`view-toggle-btn ${fileViewMode === "list" ? "active" : ""}`}
                  onClick={() => setFileViewMode("list")}
                >
                  <LayoutList size={16} />
                </button>
                <button
                  className={`view-toggle-btn ${fileViewMode === "grid" ? "active" : ""}`}
                  onClick={() => setFileViewMode("grid")}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
              <select
                className="toolbar-select"
                value={fileScale}
                onChange={(e) => setFileScale(e.target.value as FileScale)}
              >
                <option value="compact">S</option>
                <option value="comfortable">M</option>
                <option value="large">L</option>
              </select>
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
              <div className="drop-hint">{t.dragHint}</div>
              {filteredFiles.length === 0 ? (
                <div className="empty">
                  <strong>
                    {categoryFiles.length === 0 ? t.emptyCategory : t.noMatch}
                  </strong>
                  <p>
                    {categoryFiles.length === 0
                      ? t.emptyCategoryBody
                      : t.noMatchBody}
                  </p>
                </div>
              ) : (
                <div
                  className={`file-table file-table-${fileScale} file-view-${fileViewMode}`}
                >
                  {/* 根目录文件 */}
                  {rootFiles.length > 0 && (
                    <div className="file-section">
                      <div className="file-section-title">{t.rootFiles}</div>
                      <div className={`file-items file-items-${fileViewMode}`}>
                        {rootFiles.map((file) => (
                          <FileRow
                            key={file.path}
                            file={file}
                            fileViewMode={fileViewMode}
                            fileScale={fileScale}
                            draggingFile={draggingFile}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onContextMenu={(x, y, f) =>
                              setContextMenu({ x, y, file: f })
                            }
                            onOpenFile={(path) => api.openFile(path)}
                            onPreviewFile={onPreviewFile}
                          />
                        ))}
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
                          {(folder.children || []).map((file) => (
                            <FileRow
                              key={file.path}
                              file={file}
                              fileViewMode={fileViewMode}
                              fileScale={fileScale}
                              draggingFile={draggingFile}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onContextMenu={(x, y, f) =>
                                setContextMenu({ x, y, file: f })
                              }
                              onOpenFile={(path) => api.openFile(path)}
                              onPreviewFile={onPreviewFile}
                            />
                          ))}
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
                api.openFile(contextMenu.file.path);
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
                className="context-menu-item danger"
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
            await api.deleteFile(pendingDeleteFile.path);
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
    </section>
  );
}

// ── FileRow 子组件 ──────────────────────────────────────────

interface FileRowProps {
  file: CategoryFile;
  fileViewMode: FileViewMode;
  fileScale: FileScale;
  draggingFile: CategoryFile | null;
  onDragStart: (file: CategoryFile) => void;
  onDragEnd: () => void;
  onContextMenu: (x: number, y: number, file: CategoryFile) => void;
  onOpenFile: (path: string) => void;
  onPreviewFile: (path: string, name: string) => void;
}

function FileRow({
  file,
  fileViewMode,
  fileScale,
  draggingFile,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onOpenFile,
  onPreviewFile,
}: FileRowProps) {
  return (
    <div
      className={`file-table-row file-scale-${fileScale} ${draggingFile?.path === file.path ? "file-dragging" : ""}`}
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
    >
      <button
        className="file-name-cell file-clickable"
        onClick={() => onOpenFile(file.path)}
      >
        <span className="file-name-text">{file.name}</span>
      </button>
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
