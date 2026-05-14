import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Search, FileText, Folder, Inbox, X } from "lucide-react";
import { api } from "../api";
import type { AppData, Project } from "../types";

interface SearchResult {
  type: "project" | "file" | "inbox";
  id: string;
  name: string;
  path: string;
  meta?: string;
  size?: number;
  isDirectory?: boolean;
}

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  data: AppData;
  onOpenProject: (project: Project) => void;
}

// 高亮匹配文本
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastIndex = 0;
  let matchCount = 0;

  // 限制匹配次数，避免性能问题
  const maxMatches = 5;

  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1 && matchCount < maxMatches) {
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    parts.push(
      <mark key={`match-${matchCount}`} className="spotlight-highlight">
        {text.slice(index, index + query.length)}
      </mark>
    );
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
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

export function SpotlightSearch({ isOpen, onClose, data, onOpenProject }: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<number | undefined>(undefined);

  // 项目 + 收件箱（同步匹配）
  const localResults = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const text = trimmed.toLowerCase();
    const items: SearchResult[] = [];

    data.projects.forEach((project) => {
      const nameMatch = project.name.toLowerCase().includes(text);
      const aliasMatch = project.alias?.toLowerCase().includes(text);
      const tagMatch = project.tags.some((t) => t.toLowerCase().includes(text));
      const pathMatch = project.path.toLowerCase().includes(text);

      if (nameMatch || aliasMatch || tagMatch || pathMatch) {
        items.push({
          type: "project",
          id: project.id,
          name: project.name,
          path: project.path,
          meta: project.alias || project.tags.join(", ") || undefined,
        });
      }
    });

    data.inbox.forEach((item) => {
      if (item.name.toLowerCase().includes(text)) {
        items.push({
          type: "inbox",
          id: item.id,
          name: item.name,
          path: item.sourcePath,
        });
      }
    });

    return items;
  }, [query, data]);

  // 文件搜索（异步后端遍历项目目录，防抖 200ms）
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setFileResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(async () => {
      try {
        const backendFiles = await api.searchProjectFiles(trimmed);
        setFileResults(
          backendFiles.map((f) => ({
            type: "file" as const,
            id: f.path,
            name: f.name,
            path: f.path,
            meta: `${f.projectName} / ${f.category}`,
            size: f.size,
            isDirectory: f.isDirectory,
          }))
        );
      } catch {
        setFileResults([]);
      }
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  // 合并：项目 → 文件 → 收件箱
  const results = useMemo(() => {
    const merged = [...localResults, ...fileResults];
    return merged.slice(0, 20);
  }, [localResults, fileResults]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
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
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
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
          onClose();
          break;
      }
    },
    [results, selectedIndex, onClose]
  );

  // 选择结果
  const handleSelect = (result: SearchResult) => {
    if (result.type === "project") {
      const project = data.projects.find((p) => p.id === result.id);
      if (project) {
        onOpenProject(project);
        onClose();
      }
    } else if (result.type === "file") {
      if (result.isDirectory) {
        // 目录：打开父级分类文件夹
        const parent = result.path.substring(0, result.path.lastIndexOf("\\") !== -1 ? result.path.lastIndexOf("\\") : result.path.lastIndexOf("/"));
        api.openFolder(parent);
      } else {
        api.openFile(result.path);
      }
      onClose();
    }
    // inbox 类型暂不处理
  };

  if (!isOpen) return null;

  return (
    <div className="spotlight-overlay" onClick={onClose}>
      <div className="spotlight-container" onClick={(e) => e.stopPropagation()}>
        {/* 搜索框 */}
        <div className="spotlight-input-wrapper">
          <Search size={20} className="spotlight-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            placeholder="搜索项目、别名、标签、文件..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button className="spotlight-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 结果列表 */}
        {query.trim() && (
          <div className="spotlight-results" ref={listRef}>
            {results.length === 0 ? (
              <div className="spotlight-empty">
                <p>没有找到匹配的结果</p>
              </div>
            ) : (
              <>
                <div className="spotlight-list">
                  {results.map((result, index) => (
                    <button
                      key={result.id}
                      className={`spotlight-item ${index === selectedIndex ? "selected" : ""}`}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <span className="spotlight-item-type">
                        {result.type === "project" && <Folder size={16} />}
                        {result.type === "file" && result.isDirectory && <Folder size={16} />}
                        {result.type === "file" && !result.isDirectory && <FileText size={16} />}
                        {result.type === "inbox" && <Inbox size={16} />}
                      </span>
                      <div className="spotlight-item-main">
                        <span className="spotlight-item-name">
                          <HighlightText text={result.name} query={query} />
                        </span>
                        <span className="spotlight-item-meta">
                          <HighlightText text={result.meta || result.path} query={query} />
                        </span>
                      </div>
                      {result.size != null && (
                        <span className="spotlight-item-size">{formatSize(result.size)}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="spotlight-footer">
                  <span>{results.length} 个结果</span>
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
            <span className="spotlight-hint-label">输入关键词搜索项目、文件、别名和标签</span>
          </div>
        )}
      </div>
    </div>
  );
}
