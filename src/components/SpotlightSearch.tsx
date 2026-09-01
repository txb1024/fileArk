import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Search, FileText, Folder, Inbox, LoaderCircle, StickyNote, X } from "lucide-react";
import Fuse from "fuse.js";
import { api } from "../api";
import type { AppData, Project } from "../types";

interface SearchResult {
  type: "project" | "file" | "inbox" | "note";
  id: string;
  name: string;
  path: string;
  meta?: string;
  size?: number;
  isDirectory?: boolean;
  projectId?: string;
  projectName?: string;
  category?: string;
  /** 仅 note 用：正文匹配片段 */
  snippet?: string;
}

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  data: AppData;
  onOpenProject: (project: Project) => void;
  onSelectInbox?: (itemId: string) => void;
  onNavigateToFolder?: (projectId: string, category: string) => void;
  onPreviewFile?: (path: string, name: string) => void;
  /** 跳转到指定文件所在分类并高亮闪烁该行(替代直接打开预览) */
  onNavigateToFile?: (projectId: string, category: string, filePath: string) => void;
  /** 点击便签结果时:跳转到便签视图并定位到该 id */
  onSelectNote?: (noteId: string) => void;
}

// 高亮匹配文本
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  let lastIndex = 0;
  let matchCount = 0;

  // 限制匹配次数，避免性能问题
  const maxMatches = 8;

  while (lastIndex < text.length && matchCount < maxMatches) {
    let index = -1;
    let matchedTerm = "";
    for (const term of terms) {
      const nextIndex = lowerText.indexOf(term, lastIndex);
      if (nextIndex !== -1 && (index === -1 || nextIndex < index)) {
        index = nextIndex;
        matchedTerm = term;
      }
    }
    if (index === -1) break;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    parts.push(
      <mark key={`match-${matchCount}`} className="spotlight-highlight">
        {text.slice(index, index + matchedTerm.length)}
      </mark>
    );
    lastIndex = index + matchedTerm.length;
    matchCount++;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function SpotlightSearch({
  isOpen,
  onClose,
  data,
  onOpenProject,
  onSelectInbox,
  onNavigateToFolder,
  onPreviewFile,
  onNavigateToFile,
  onSelectNote,
}: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const [noteResults, setNoteResults] = useState<SearchResult[]>([]);
  const [isFileSearching, setIsFileSearching] = useState(false);
  const [isNoteSearching, setIsNoteSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<number | undefined>(undefined);
  const noteSearchTimerRef = useRef<number | undefined>(undefined);
  const [isClosing, setIsClosing] = useState(false);

  // 项目 + 收件箱(Fuse.js 模糊匹配:支持 typo、权重、忽略大小写)
  const projectFuse = useMemo(
    () =>
      new Fuse(data.projects, {
        keys: [
          { name: "name", weight: 3 },
          { name: "alias", weight: 2 },
          { name: "tags", weight: 2 },
          { name: "path", weight: 1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: false,
      }),
    [data.projects]
  );
  const inboxFuse = useMemo(
    () =>
      new Fuse(data.inbox, {
        keys: ["name"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [data.inbox]
  );

  const localResults = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const items: SearchResult[] = [];
    projectFuse.search(trimmed, { limit: 20 }).forEach(({ item: project }) => {
      items.push({
        type: "project",
        id: project.id,
        name: project.name,
        path: project.path,
        meta: project.alias || project.tags.join(", ") || undefined,
      });
    });
    inboxFuse.search(trimmed, { limit: 20 }).forEach(({ item }) => {
      items.push({
        type: "inbox",
        id: item.id,
        name: item.name,
        path: item.sourcePath,
      });
    });
    return items;
  }, [query, projectFuse, inboxFuse]);

  // 文件搜索（异步后端遍历项目目录，防抖 200ms；abort flag 防止旧请求覆盖新请求）
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFileResults([]);
      setIsFileSearching(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    let cancelled = false;
    setIsFileSearching(true);
    searchTimerRef.current = window.setTimeout(async () => {
      try {
        const backendFiles = await api.searchProjectFiles(trimmed);
        if (cancelled) return;
        setFileResults(
          backendFiles.map((f) => ({
            type: "file" as const,
            id: f.path,
            name: f.name,
            path: f.path,
            meta: f.category ? `${f.projectName} / ${f.category}` : f.projectName,
            size: f.size,
            isDirectory: f.isDirectory,
            projectId: f.projectId,
            projectName: f.projectName,
            category: f.category,
          }))
        );
      } catch {
        if (!cancelled) setFileResults([]);
      } finally {
        if (!cancelled) setIsFileSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  // 便签搜索（后端 search_notes 同时匹配 title/tags/path/正文,防抖 200ms;abort flag 同上）
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setNoteResults([]);
      setIsNoteSearching(false);
      return;
    }
    if (noteSearchTimerRef.current) clearTimeout(noteSearchTimerRef.current);
    let cancelled = false;
    setIsNoteSearching(true);
    noteSearchTimerRef.current = window.setTimeout(async () => {
      try {
        const notes = await api.searchNotes(trimmed);
        if (cancelled) return;
        setNoteResults(
          notes.map((n) => ({
            type: "note" as const,
            id: n.id,
            name: n.title || n.name,
            path: n.id,
            meta: n.parent || "便签",
            snippet: n.snippet || undefined,
          }))
        );
      } catch {
        if (!cancelled) setNoteResults([]);
      } finally {
        if (!cancelled) setIsNoteSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      if (noteSearchTimerRef.current) clearTimeout(noteSearchTimerRef.current);
    };
  }, [query]);

  // 各类型先保留基础配额，再用剩余结果补满，避免文件结果把便签或项目全部挤掉。
  const results = useMemo(() => {
    const localProjects = localResults.filter((r) => r.type === "project");
    const localInbox = localResults.filter((r) => r.type === "inbox");
    const groups = [localProjects, fileResults, noteResults, localInbox];
    const quotas = [8, 24, 12, 6];
    const selected = groups.flatMap((group, index) => group.slice(0, quotas[index]));
    const remaining = groups.flatMap((group, index) => group.slice(quotas[index]));
    return [...selected, ...remaining].slice(0, 50);
  }, [localResults, fileResults, noteResults]);

  const isSearching = isFileSearching || isNoteSearching;

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (noteSearchTimerRef.current) clearTimeout(noteSearchTimerRef.current);
    };
  }, []);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setFileResults([]);
      setNoteResults([]);
      setIsFileSearching(false);
      setIsNoteSearching(false);
      setIsClosing(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // 滚动到选中项
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const items = listRef.current.querySelectorAll(".spotlight-item");
      const selectedItem = items[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (!isClosing) setIsClosing(true);
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (!isClosing) setIsClosing(true);
          break;
      }
    },
    [results, selectedIndex, isClosing]
  );

  // 请求关闭：先播放 Spring 退出动画，动画结束后再真正关闭
  const isClosingRef = useRef(isClosing);
  useEffect(() => {
    isClosingRef.current = isClosing;
  }, [isClosing]);

  const handleRequestClose = useCallback(() => {
    if (isClosingRef.current) return;
    setIsClosing(true);
  }, []);

  // 动画结束回调（overlay 动画结束时触发）
  const pendingActionRef = useRef<(() => void) | null>(null);
  const handleOverlayAnimationEnd = useCallback(
    (e?: any) => {
      // 只响应 overlay 的退出动画，不响应 container 的动画
      if (e && e.animationName !== "spotlight-overlay-out") return;
      if (!isClosingRef.current) return;
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      setIsClosing(false);
      // 先执行待定动作，再关闭
      if (pending) pending();
      onClose();
    },
    [onClose]
  );

  // 选择结果（先存动作，等退出动画结束后再执行）
  const handleSelect = (result: SearchResult) => {
    if (result.type === "project") {
      const project = data.projects.find((p) => p.id === result.id);
      if (project) {
        pendingActionRef.current = () => onOpenProject(project);
        if (!isClosing) setIsClosing(true);
      }
    } else if (result.type === "file") {
      const projectId = result.projectId || "";
      const category = result.category || "";
      if (result.isDirectory) {
        pendingActionRef.current = () => onNavigateToFolder?.(projectId, category);
      } else if (onNavigateToFile && category) {
        // 优先跳转 + 高亮(替代直接打开预览)
        pendingActionRef.current = () => onNavigateToFile(projectId, category, result.path);
      } else {
        // 项目根目录文件不属于任何分类，直接预览；未接导航回调时也走此兜底。
        pendingActionRef.current = () => onPreviewFile?.(result.path, result.name);
      }
      if (!isClosing) setIsClosing(true);
    } else if (result.type === "inbox") {
      pendingActionRef.current = () => onSelectInbox?.(result.id);
      if (!isClosing) setIsClosing(true);
    } else if (result.type === "note") {
      pendingActionRef.current = () => onSelectNote?.(result.id);
      if (!isClosing) setIsClosing(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`spotlight-overlay${isClosing ? " closing" : ""}`}
      ref={overlayRef}
      onClick={handleRequestClose}
      onAnimationEnd={handleOverlayAnimationEnd}
    >
      <div
        className={`spotlight-container${isClosing ? " closing" : ""}`}
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="spotlight-input-wrapper">
          <Search size={20} className="spotlight-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            placeholder="搜索项目、便签、文件、别名、标签..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button className="spotlight-close-btn" onClick={handleRequestClose}>
            <X size={16} />
          </button>
        </div>

        {/* 结果列表 */}
        {query.trim() && (
          <div className="spotlight-results" ref={listRef}>
            {results.length === 0 && isSearching ? (
              <div className="spotlight-empty spotlight-loading">
                <LoaderCircle size={20} className="spotlight-spinner" />
                <p>正在搜索文件和便签…</p>
              </div>
            ) : results.length === 0 ? (
              <div className="spotlight-empty">
                <p>没有找到匹配的结果</p>
              </div>
            ) : (
              <>
                <div className="spotlight-list">
                  {results.map((result, index) => (
                    <button
                      key={`${result.type}:${result.id}`}
                      className={`spotlight-item ${index === selectedIndex ? "selected" : ""}`}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <span className="spotlight-item-type">
                        {result.type === "project" && <Folder size={16} />}
                        {result.type === "file" && result.isDirectory && <Folder size={16} />}
                        {result.type === "file" && !result.isDirectory && <FileText size={16} />}
                        {result.type === "inbox" && <Inbox size={16} />}
                        {result.type === "note" && <StickyNote size={16} />}
                      </span>
                      <div className="spotlight-item-main">
                        <span className="spotlight-item-name">
                          <HighlightText text={result.name} query={query} />
                        </span>
                        <span className="spotlight-item-meta">
                          <HighlightText text={result.meta || result.path} query={query} />
                        </span>
                        {result.type === "note" && result.snippet && (
                          <span className="spotlight-item-snippet">
                            <HighlightText text={result.snippet} query={query} />
                          </span>
                        )}
                      </div>
                      {result.size != null && !result.isDirectory && (
                        <span className="spotlight-item-size">{formatSize(result.size)}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="spotlight-footer">
                  <span>
                    {isSearching
                      ? `正在搜索… 已找到 ${results.length} 个结果`
                      : `${results.length} 个结果`}
                  </span>
                  <span className="spotlight-footer-hint">
                    <kbd>↑↓</kbd> 导航 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* 快捷键提示（无搜索时） */}
        {!query.trim() && (
          <div className="spotlight-hints">
            <span className="spotlight-hint-label">输入关键词搜索项目、便签、文件、别名和标签</span>
          </div>
        )}
      </div>
    </div>
  );
}
