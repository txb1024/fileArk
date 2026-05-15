import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  FileText,
  X,
  Tag,
  RotateCcw,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { api } from "../api";
import type { NoteMeta } from "../types";
import { NoteEditor } from "../components/notes/NoteEditor";

type Language = "zh" | "en";

const labels = {
  zh: {
    notes: "便签",
    searchPlaceholder: "搜索便签...",
    newNote: "新建",
    pinned: "置顶",
    frequent: "常用",
    temporary: "临时",
    noNotes: "还没有便签",
    noNotesBody: '点击"新建"创建第一个便签。',
    deleteConfirm: "确定删除此便签？",
    lastSaved: "最后保存",
    emptyEditor: "选择或创建一个便签开始编辑",
    emptyEditorBody: '左侧列表点击便签，或点击右上角"新建"按钮。',
    addTag: "添加标签",
    tagPlaceholder: "输入标签",
    trash: "回收站",
    trashEmpty: "回收站是空的",
    restore: "恢复",
    permanentDelete: "永久删除",
    emptyTrash: "清空回收站",
    emptyTrashConfirm: "确定清空回收站？此操作不可恢复。",
    showTrash: "回收站",
    hideTrash: "返回便签",
    shortcutNew: "Ctrl+N 新建",
    shortcutDelete: "Delete 删除",
    shortcutPin: "Ctrl+P 置顶",
    customCategory: "自定义分类…",
    newCategoryPlaceholder: "输入分类名",
    enterFocus: "进入专注模式 (F11)",
    exitFocus: "退出专注模式 (Esc)",
  },
  en: {
    notes: "Notes",
    searchPlaceholder: "Search notes...",
    newNote: "New",
    pinned: "Pinned",
    frequent: "Frequent",
    temporary: "Temporary",
    noNotes: "No notes yet",
    noNotesBody: 'Click "New" to create your first note.',
    deleteConfirm: "Are you sure you want to delete this note?",
    lastSaved: "Last saved",
    emptyEditor: "Select or create a note to start editing",
    emptyEditorBody: 'Click a note on the left, or click "New" button.',
    addTag: "Add tag",
    tagPlaceholder: "Enter tag",
    trash: "Trash",
    trashEmpty: "Trash is empty",
    restore: "Restore",
    permanentDelete: "Delete permanently",
    emptyTrash: "Empty Trash",
    emptyTrashConfirm: "Are you sure? This action cannot be undone.",
    showTrash: "Trash",
    hideTrash: "Back to notes",
    shortcutNew: "Ctrl+N New",
    shortcutDelete: "Delete",
    shortcutPin: "Ctrl+P Pin",
    customCategory: "Custom category…",
    newCategoryPlaceholder: "Enter category name",
    enterFocus: "Enter focus mode (F11)",
    exitFocus: "Exit focus mode (Esc)",
  },
};

interface NotesViewProps {
  language: Language;
}

export function NotesView({ language }: NotesViewProps) {
  const t = labels[language];
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState<NoteMeta[]>([]);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState(false);
  const [customCategoryValue, setCustomCategoryValue] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载笔记列表
  const loadNotes = useCallback(async () => {
    const list = await api.listNotes();
    setNotes(list);
  }, []);

  const loadTrashedNotes = useCallback(async () => {
    const list = await api.listTrashedNotes();
    setTrashedNotes(list);
  }, []);

  useEffect(() => {
    loadNotes();
    loadTrashedNotes();
  }, [loadNotes, loadTrashedNotes]);

  // 搜索（使用后端搜索 API）
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      const results = await api.searchNotes(searchQuery.trim());
      setSearchResults(results);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // 过滤与排序
  const filteredNotes = useMemo(() => {
    let list = searchResults ?? notes;
    if (filterCategory) {
      list = list.filter((n) => n.category === filterCategory);
    }
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes, searchResults, filterCategory]);

  // 分类统计（去重保护）
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      const cat = n.category.trim();
      if (!cat) continue;
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans"));
  }, [notes]);

  // 所有分类（供 select 使用）
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (n.category.trim()) set.add(n.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans"));
  }, [notes]);

  // 当前活跃笔记
  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  // 选择笔记
  const selectNote = useCallback(async (id: string) => {
    setActiveNoteId(id);
    const content = await api.getNoteContent(id);
    setNoteContent(content);
    setDeleteConfirmId(null);
    setTagInputId(null);
  }, []);

  // 新建笔记
  const handleCreate = useCallback(async () => {
    const meta = await api.createNote({
      category: filterCategory || "临时",
    });
    setNotes((prev) => [meta, ...prev]);
    selectNote(meta.id);
  }, [filterCategory, selectNote]);

  // 自动保存（save_note 返回 NoteMeta，就地更新）
  const handleContentChange = useCallback(
    async (markdown: string) => {
      if (!activeNoteId) return;
      setNoteContent(markdown);
      try {
        const updated = await api.saveNote(activeNoteId, markdown);
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        setLastSavedAt(new Date().toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US"));
      } catch {
        // 静默失败，不阻塞编辑
      }
    },
    [activeNoteId, language]
  );

  // 乐观更新辅助
  const optimisticUpdate = useCallback(async (id: string, patch: Partial<NoteMeta>, apiCall: () => Promise<void>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n))
    );
    try {
      await apiCall();
    } catch {
      // 回滚：重新加载
      loadNotes();
    }
  }, [loadNotes]);

  // 切换置顶（乐观更新）
  const togglePin = useCallback(
    (id: string, currentPinned: boolean) => {
      optimisticUpdate(id, { pinned: !currentPinned }, () =>
        api.updateNoteMeta(id, { pinned: !currentPinned })
      );
    },
    [optimisticUpdate]
  );

  // 删除笔记（软删除）
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteNote(id);
        if (activeNoteId === id) {
          setActiveNoteId(null);
          setNoteContent("");
        }
        setDeleteConfirmId(null);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        loadTrashedNotes();
      } catch {
        loadNotes();
      }
    },
    [activeNoteId, loadNotes, loadTrashedNotes]
  );

  // 切换分类（乐观更新）
  const changeCategory = useCallback(
    (id: string, category: string) => {
      optimisticUpdate(id, { category }, () => api.updateNoteMeta(id, { category }));
    },
    [optimisticUpdate]
  );

  // Tags 操作
  const addTag = useCallback(
    (id: string, tag: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note || note.tags.includes(tag)) return;
      const newTags = [...note.tags, tag];
      optimisticUpdate(id, { tags: newTags }, () => api.updateNoteMeta(id, { tags: newTags }));
    },
    [notes, optimisticUpdate]
  );

  const removeTag = useCallback(
    (id: string, tag: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      const newTags = note.tags.filter((t) => t !== tag);
      optimisticUpdate(id, { tags: newTags }, () => api.updateNoteMeta(id, { tags: newTags }));
    },
    [notes, optimisticUpdate]
  );

  // 回收站操作
  const handleRestore = useCallback(
    async (id: string) => {
      const meta = await api.restoreNote(id);
      setNotes((prev) => [meta, ...prev]);
      setTrashedNotes((prev) => prev.filter((n) => n.id !== id));
    },
    []
  );

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      await api.permanentlyDeleteNote(id);
      setTrashedNotes((prev) => prev.filter((n) => n.id !== id));
    },
    []
  );

  const handleEmptyTrash = useCallback(async () => {
    await api.emptyNotesTrash();
    setTrashedNotes([]);
    setEmptyTrashConfirm(false);
  }, []);

  // 自定义分类提交
  const handleCustomCategory = useCallback(
    (noteId: string) => {
      const cat = customCategoryValue.trim();
      if (!cat) {
        setCustomCategoryInput(false);
        return;
      }
      changeCategory(noteId, cat);
      setCustomCategoryInput(false);
      setCustomCategoryValue("");
    },
    [customCategoryValue, changeCategory]
  );

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inEditableField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // F11 切换专注模式（任何场景下都响应）
      if (e.key === "F11") {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }

      // ESC 退出专注模式（不抢占输入框中的 Esc）
      if (e.key === "Escape" && focusMode && !inEditableField) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }

      // 不在输入框中拦截以下快捷键
      if (inEditableField) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleCreate();
      }
      if (e.key === "Delete" && activeNoteId && !deleteConfirmId) {
        e.preventDefault();
        setDeleteConfirmId(activeNoteId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p" && activeNoteId) {
        e.preventDefault();
        const note = notes.find((n) => n.id === activeNoteId);
        if (note) togglePin(activeNoteId, note.pinned);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCreate, activeNoteId, deleteConfirmId, notes, togglePin, focusMode]);

  // 格式化时间
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return language === "zh" ? "刚刚" : "just now";
    if (diffMins < 60) return `${diffMins}${language === "zh" ? "分钟前" : "m ago"}`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}${language === "zh" ? "小时前" : "h ago"}`;
    return d.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US");
  };

  return (
    <div className={focusMode ? "notes-view notes-view-focus" : "notes-view"}>
      {/* 左侧列表面板 */}
      <div className="notes-sidebar">
        {/* 搜索栏 + 新建按钮 */}
        <div className="notes-toolbar">
          <div className="notes-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="notes-search-clear" onClick={() => setSearchQuery("")}>
                <X size={14} />
              </button>
            )}
          </div>
          <button className="notes-new-btn" onClick={handleCreate} title={t.shortcutNew}>
            <Plus size={15} />
            {t.newNote}
          </button>
        </div>

        {/* 分类过滤 */}
        <div className="notes-categories">
          <button
            className={!filterCategory ? "notes-cat-btn active" : "notes-cat-btn"}
            onClick={() => setFilterCategory(null)}
          >
            {language === "zh" ? "全部" : "All"}
          </button>
          {categories.map(([cat, count]) => (
            <button
              key={cat}
              className={filterCategory === cat ? "notes-cat-btn active" : "notes-cat-btn"}
              onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
            >
              {cat} ({count})
            </button>
          ))}
          <button
            className={showTrash ? "notes-cat-btn active" : "notes-cat-btn notes-trash-btn"}
            onClick={() => {
              setShowTrash(!showTrash);
              if (!showTrash) loadTrashedNotes();
            }}
          >
            <Trash2 size={12} />
            {t.trash}
            {trashedNotes.length > 0 && ` (${trashedNotes.length})`}
          </button>
        </div>

        {/* 列表 */}
        <div className="notes-list" ref={listRef}>
          {showTrash ? (
            /* 回收站列表 */
            trashedNotes.length === 0 ? (
              <div className="notes-empty">
                <Trash2 size={32} />
                <p>{t.trashEmpty}</p>
              </div>
            ) : (
              <>
                {trashedNotes.map((note) => (
                  <div key={note.id} className="notes-item notes-trash-item">
                    <div className="notes-item-header">
                      <FileText size={14} className="notes-item-icon" />
                      <span className="notes-item-title">{note.title}</span>
                    </div>
                    <div className="notes-item-meta">
                      <span className="notes-item-cat">{note.category}</span>
                      <span className="muted small">{formatTime(note.updatedAt)}</span>
                    </div>
                    <div className="notes-item-actions" style={{ display: "flex" }}>
                      <button
                        className="notes-action-btn"
                        onClick={() => handleRestore(note.id)}
                        title={t.restore}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        className="notes-action-btn danger"
                        onClick={() => handlePermanentDelete(note.id)}
                        title={t.permanentDelete}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="notes-trash-footer">
                  {emptyTrashConfirm ? (
                    <div className="notes-delete-confirm">
                      <span>
                        <AlertTriangle size={14} style={{ verticalAlign: "-2px" }} />{" "}
                        {t.emptyTrashConfirm}
                      </span>
                      <div className="notes-delete-confirm-btns">
                        <button className="compact-button danger" onClick={handleEmptyTrash}>
                          {t.emptyTrash}
                        </button>
                        <button className="compact-button" onClick={() => setEmptyTrashConfirm(false)}>
                          {language === "zh" ? "取消" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="notes-trash-empty-btn"
                      onClick={() => setEmptyTrashConfirm(true)}
                    >
                      {t.emptyTrash}
                    </button>
                  )}
                </div>
              </>
            )
          ) : filteredNotes.length === 0 ? (
            <div className="notes-empty">
              <StickyNote size={32} />
              <p>{t.noNotes}</p>
              <p className="muted small">{t.noNotesBody}</p>
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                className={note.id === activeNoteId ? "notes-item active" : "notes-item"}
                onClick={() => selectNote(note.id)}
              >
                <div className="notes-item-header">
                  <FileText size={14} className="notes-item-icon" />
                  <span className="notes-item-title">{note.title}</span>
                  {note.pinned && <Pin size={12} className="notes-item-pin" />}
                </div>
                {/* 摘要 */}
                {note.snippet && (
                  <div className="notes-item-snippet">{note.snippet}</div>
                )}
                <div className="notes-item-meta">
                  <span className="notes-item-cat">{note.category}</span>
                  {note.tags.length > 0 && (
                    <span className="notes-item-tags">
                      {note.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="notes-item-tag">
                          {tag}
                        </span>
                      ))}
                      {note.tags.length > 2 && (
                        <span className="notes-item-tag">+{note.tags.length - 2}</span>
                      )}
                    </span>
                  )}
                  <span className="muted small">{formatTime(note.updatedAt)}</span>
                </div>
                {/* 悬停操作 */}
                <div className="notes-item-actions">
                  <button
                    className="notes-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(note.id, note.pinned);
                    }}
                    title={t.pinned}
                  >
                    <Pin size={13} />
                  </button>
                  <button
                    className="notes-action-btn danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(deleteConfirmId === note.id ? null : note.id);
                    }}
                    title={language === "zh" ? "删除" : "Delete"}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {/* 删除确认 */}
                {deleteConfirmId === note.id && (
                  <div className="notes-delete-confirm" onClick={(e) => e.stopPropagation()}>
                    <span>{t.deleteConfirm}</span>
                    <div className="notes-delete-confirm-btns">
                      <button className="compact-button danger" onClick={() => handleDelete(note.id)}>
                        {language === "zh" ? "删除" : "Delete"}
                      </button>
                      <button className="compact-button" onClick={() => setDeleteConfirmId(null)}>
                        {language === "zh" ? "取消" : "Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧编辑区 */}
      <div className="notes-editor-area">
        {activeNote ? (
          <>
            <div className="notes-editor-topbar">
              <div className="notes-editor-meta">
                {/* Tags 编辑 */}
                <div className="notes-tags-editor">
                  {activeNote.tags.map((tag) => (
                    <span key={tag} className="notes-tag-chip">
                      {tag}
                      <button
                        className="notes-tag-remove"
                        onClick={() => removeTag(activeNote.id, tag)}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {tagInputId === activeNote.id ? (
                    <input
                      className="notes-tag-input"
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagInputValue.trim()) {
                          addTag(activeNote.id, tagInputValue.trim());
                          setTagInputValue("");
                        }
                        if (e.key === "Escape") {
                          setTagInputId(null);
                          setTagInputValue("");
                        }
                      }}
                      onBlur={() => {
                        if (tagInputValue.trim()) {
                          addTag(activeNote.id, tagInputValue.trim());
                        }
                        setTagInputId(null);
                        setTagInputValue("");
                      }}
                      placeholder={t.tagPlaceholder}
                      autoFocus
                    />
                  ) : (
                    <button
                      className="notes-tag-add"
                      onClick={() => setTagInputId(activeNote.id)}
                    >
                      <Tag size={11} />
                      {t.addTag}
                    </button>
                  )}
                </div>
              </div>
              <div className="notes-editor-actions">
                {/* 动态分类选择 */}
                {customCategoryInput ? (
                  <div className="notes-category-custom">
                    <input
                      value={customCategoryValue}
                      onChange={(e) => setCustomCategoryValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCustomCategory(activeNote.id);
                        if (e.key === "Escape") {
                          setCustomCategoryInput(false);
                          setCustomCategoryValue("");
                        }
                      }}
                      onBlur={() => handleCustomCategory(activeNote.id)}
                      placeholder={t.newCategoryPlaceholder}
                      autoFocus
                    />
                  </div>
                ) : (
                  <select
                    className="notes-category-select"
                    value={activeNote.category}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setCustomCategoryInput(true);
                        setCustomCategoryValue("");
                      } else {
                        changeCategory(activeNote.id, e.target.value);
                      }
                    }}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {/* 硬编码兜底选项 */}
                    {!allCategories.includes("常用") && <option value="常用">{t.frequent}</option>}
                    {!allCategories.includes("临时") && <option value="临时">{t.temporary}</option>}
                    <option value="__custom__">{t.customCategory}</option>
                  </select>
                )}
                {lastSavedAt && (
                  <span className="muted small">
                    {t.lastSaved}: {lastSavedAt}
                  </span>
                )}
                <button
                  className="notes-focus-toggle"
                  onClick={() => setFocusMode((v) => !v)}
                  title={focusMode ? t.exitFocus : t.enterFocus}
                  aria-label={focusMode ? t.exitFocus : t.enterFocus}
                >
                  {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
            <div className="notes-editor-content">
              <NoteEditor content={noteContent} onContentChange={handleContentChange} language={language} />
            </div>
          </>
        ) : (
          <div className="notes-empty-editor">
            <StickyNote size={48} />
            <h3>{t.emptyEditor}</h3>
            <p className="muted">{t.emptyEditorBody}</p>
            <div className="notes-shortcut-hints">
              <kbd>Ctrl+N</kbd> {t.shortcutNew}
              <kbd>Delete</kbd> {t.shortcutDelete}
              <kbd>Ctrl+P</kbd> {t.shortcutPin}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
