import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Search, FileText, Folder, Inbox, X } from "lucide-react";
import type { AppData, Project, InboxItem } from "../types";

interface SearchResult {
  type: "project" | "file" | "inbox";
  id: string;
  name: string;
  path: string;
  meta?: string;
  size?: number;
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

// 获取文件图标类型
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    pdf: "📄",
    doc: "📝", docx: "📝",
    xls: "📊", xlsx: "📊",
    ppt: "📽️", pptx: "📽️",
    jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", webp: "🖼️",
    mp4: "🎬", avi: "🎬", mov: "🎬",
    mp3: "🎵", wav: "🎵",
    zip: "📦", rar: "📦", "7z": "📦",
    js: "💻", ts: "💻", jsx: "💻", tsx: "💻",
    java: "☕", py: "🐍", go: "🔵",
    md: "📖", txt: "📖",
  };
  return iconMap[ext] || "📄";
}

export function SpotlightSearch({ isOpen, onClose, data, onOpenProject }: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // 搜索结果
  const results = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const text = trimmed.toLowerCase();
    const allResults: SearchResult[] = [];

    // 搜索项目
    data.projects.forEach((project) => {
      const nameMatch = project.name.toLowerCase().includes(text);
      const aliasMatch = project.alias?.toLowerCase().includes(text);
      const tagMatch = project.tags.some((t) => t.toLowerCase().includes(text));
      const pathMatch = project.path.toLowerCase().includes(text);

      if (nameMatch || aliasMatch || tagMatch || pathMatch) {
        allResults.push({
          type: "project",
          id: project.id,
          name: project.name,
          path: project.path,
          meta: project.alias || project.tags.join(", ") || undefined,
        });
      }
    });

    // 搜索文件
    data.projects.forEach((project) => {
      (project.recentFiles || []).forEach((file) => {
        const nameMatch = file.name.toLowerCase().includes(text);
        const categoryMatch = file.category.toLowerCase().includes(text);

        if (nameMatch || categoryMatch) {
          allResults.push({
            type: "file",
            id: file.path,
            name: file.name,
            path: file.path,
            meta: `${project.name} / ${file.category}`,
            size: file.size,
          });
        }
      });
    });

    // 搜索收件箱
    data.inbox.forEach((item) => {
      if (item.name.toLowerCase().includes(text)) {
        allResults.push({
          type: "inbox",
          id: item.id,
          name: item.name,
          path: item.sourcePath,
        });
      }
    });

    return allResults.slice(0, 20); // 最多返回20个结果
  }, [query, data]);

  const visibleResults = results.slice(0, 6); // 只显示前6个

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
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, Math.min(results.length, 6) - 1));
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
      // 打开文件
      window.open(`file://${result.path}`);
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
                  {visibleResults.map((result, index) => (
                    <button
                      key={result.id}
                      className={`spotlight-item ${index === selectedIndex ? "selected" : ""}`}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="spotlight-item-icon">
                        {result.type === "project" && <Folder size={18} />}
                        {result.type === "file" && <span className="file-emoji">{getFileIcon(result.name)}</span>}
                        {result.type === "inbox" && <Inbox size={18} />}
                      </div>
                      <div className="spotlight-item-content">
                        <div className="spotlight-item-name">
                          <HighlightText text={result.name} query={query} />
                        </div>
                        <div className="spotlight-item-path">
                          {result.meta || result.path}
                        </div>
                      </div>
                      {result.size && (
                        <div className="spotlight-item-size">{formatSize(result.size)}</div>
                      )}
                    </button>
                  ))}
                </div>
                {results.length > 6 && (
                  <div className="spotlight-footer">
                    <span className="spotlight-hint">
                      <kbd>↑</kbd><kbd>↓</kbd> 导航 &nbsp;
                      <kbd>Enter</kbd> 打开 &nbsp;
                      <kbd>Esc</kbd> 关闭
                    </span>
                    <span className="spotlight-count">
                      共 {results.length} 个结果，滚动查看更多
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 快捷键提示（无搜索时） */}
        {!query.trim() && (
          <div className="spotlight-hints">
            <div className="spotlight-hint-row">
              <kbd>Ctrl</kbd>+<kbd>K</kbd>
              <span>打开搜索</span>
            </div>
            <div className="spotlight-hint-row">
              <kbd>↑</kbd><kbd>↓</kbd>
              <span>选择</span>
            </div>
            <div className="spotlight-hint-row">
              <kbd>Enter</kbd>
              <span>打开</span>
            </div>
            <div className="spotlight-hint-row">
              <kbd>Esc</kbd>
              <span>关闭</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
