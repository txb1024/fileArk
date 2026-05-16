import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  StickyNote,
  Trash2,
  X,
  Tag,
  RotateCcw,
  AlertTriangle,
  Maximize2,
  Minimize2,
  PanelRight,
  PanelRightClose,
  PinOff,
  FolderPlus,
  Pin,
  FileText,
  Pencil,
  ChevronLeft,
} from "lucide-react";
import { api } from "../api";
import type { NoteMeta, NoteTreeNode, TrashedNote } from "../types";
import { NoteEditor, dropEditorCache, renameEditorCache } from "../components/notes/NoteEditor";
import {
  NoteTree,
  activeNoteIdStore,
  type RenamingTarget,
} from "../components/notes/NoteTree";
import { ContextMenu, type ContextMenuItem } from "../components/notes/ContextMenu";
import { EditorErrorBoundary } from "../components/notes/EditorErrorBoundary";

type Language = "zh" | "en";

/** 在树中按 id 查找便签元数据 */
function findNoteInTree(nodes: NoteTreeNode[], id: string): NoteMeta | null {
  for (const n of nodes) {
    if (n.type === "note" && n.id === id) {
      const { type, ...meta } = n;
      void type;
      return meta;
    }
    if (n.type === "folder") {
      const found = findNoteInTree(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

const labels = {
  zh: {
    notes: "便签",
    searchPlaceholder: "搜索便签...",
    newNote: "新建便签",
    newFolder: "新建文件夹",
    pinned: "置顶",
    noNotes: "还没有便签",
    noNotesBody: "在空白处右键，或按 Ctrl+N 新建便签、Ctrl+Shift+N 新建文件夹。",
    deleteNoteConfirm: "删除此便签？将进入回收站。",
    deleteFolderConfirm: "删除此文件夹？里面所有便签会进入回收站。",
    lastSaved: "最后保存",
    emptyEditor: "选择或创建一个便签开始编辑",
    emptyEditorBody: "左侧点击便签，或点上方按钮新建。",
    addTag: "添加标签",
    tagPlaceholder: "输入标签",
    trash: "回收站",
    trashEmpty: "回收站是空的",
    restore: "恢复",
    permanentDelete: "永久删除",
    emptyTrash: "清空回收站",
    emptyTrashConfirm: "确定清空回收站？此操作不可恢复。",
    backToTree: "返回便签",
    shortcutNew: "Ctrl+N 新建",
    shortcutDelete: "Delete 删除",
    shortcutPin: "Ctrl+P 置顶",
    enterFocus: "进入专注模式 (F11)",
    exitFocus: "退出专注模式 (Esc)",
    showOutline: "显示大纲",
    hideOutline: "隐藏大纲",
    pinToolbar: "固定工具栏",
    unpinToolbar: "取消固定",
    rename: "重命名",
    delete: "删除",
    pin: "置顶",
    unpin: "取消置顶",
    searchResults: "搜索结果",
    noResults: "没有匹配项",
    rootNote: "新建（根目录）",
    rootFolder: "新建文件夹（根目录）",
  },
  en: {
    notes: "Notes",
    searchPlaceholder: "Search notes...",
    newNote: "New note",
    newFolder: "New folder",
    pinned: "Pinned",
    noNotes: "No notes yet",
    noNotesBody: "Right-click here, or press Ctrl+N to add a note, Ctrl+Shift+N for a folder.",
    deleteNoteConfirm: "Delete this note? It moves to trash.",
    deleteFolderConfirm: "Delete this folder? All notes inside go to trash.",
    lastSaved: "Last saved",
    emptyEditor: "Select or create a note to start editing",
    emptyEditorBody: "Click a note on the left, or use the buttons above.",
    addTag: "Add tag",
    tagPlaceholder: "Enter tag",
    trash: "Trash",
    trashEmpty: "Trash is empty",
    restore: "Restore",
    permanentDelete: "Delete permanently",
    emptyTrash: "Empty Trash",
    emptyTrashConfirm: "Empty trash? This cannot be undone.",
    backToTree: "Back to notes",
    shortcutNew: "Ctrl+N New",
    shortcutDelete: "Delete",
    shortcutPin: "Ctrl+P Pin",
    enterFocus: "Enter focus mode (F11)",
    exitFocus: "Exit focus mode (Esc)",
    showOutline: "Show outline",
    hideOutline: "Hide outline",
    pinToolbar: "Pin toolbar",
    unpinToolbar: "Unpin toolbar",
    rename: "Rename",
    delete: "Delete",
    pin: "Pin",
    unpin: "Unpin",
    searchResults: "Results",
    noResults: "No matches",
    rootNote: "New (root)",
    rootFolder: "New folder (root)",
  },
};

interface NotesViewProps {
  language: Language;
}

const EXPAND_KEY = "fileark.notes.expanded";

export function NotesView({ language }: NotesViewProps) {
  const t = labels[language];
  const [tree, setTree] = useState<NoteTreeNode[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // 同步到 NoteTree 的外部 store：高亮态走选择性订阅,
  // 点击便签时只「旧高亮」「新高亮」两行重渲染,整棵树跳过 reconcile。
  useEffect(() => {
    activeNoteIdStore.set(activeId);
  }, [activeId]);

  /** 选中便签的展示用 meta：只由 tree + activeId 推导，单一数据源（保存后通过 loadTree 刷新树） */
  const activeMeta = useMemo(
    () => (activeId ? findNoteInTree(tree, activeId) : null),
    [tree, activeId],
  );

  // editorPayload：编辑器当前显示的内容 + 它属于哪个便签 id
  // 一定保证两者配对：activeId 切换时，editorPayload 仍是上一篇，直到新内容到位才一起更新
  const [editorPayload, setEditorPayload] = useState<{ id: string; content: string } | null>(null);
  const editorPayloadRef = useRef(editorPayload);
  editorPayloadRef.current = editorPayload;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string>("");
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState<TrashedNote[]>([]);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");
  // inline 创建文件夹的位置（parent="" 表示根目录）；null = 不在创建中
  const [pendingFolder, setPendingFolder] = useState<{ parent: string } | null>(null);
  // inline 重命名目标
  const [renamingTarget, setRenamingTarget] = useState<RenamingTarget | null>(null);
  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: NoteTreeNode | null; // null = 空白处
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteTreeNode | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(true);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPAND_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set<string>();
  });

  // 持久化展开状态
  useEffect(() => {
    try {
      localStorage.setItem(EXPAND_KEY, JSON.stringify(Array.from(expandedPaths)));
    } catch {}
  }, [expandedPaths]);

  const loadTree = useCallback(async () => {
    const list = await api.listNotesTree();
    setTree(list);
  }, []);

  const loadTrashed = useCallback(async () => {
    const list = await api.listTrashedNotes();
    setTrashedNotes(list);
  }, []);

  useEffect(() => {
    loadTree();
    loadTrashed();
  }, [loadTree, loadTrashed]);

  // 搜索（debounce）
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // 编辑器实时上报的最新内容（debounce 还没到时存这里），切换便签前 flush
  const pendingContentRef = useRef<{ id: string; content: string } | null>(null);
  // 最近一次用户期望选中的 id，用于竞态丢弃过时的 getNoteContent 结果
  const selectionTokenRef = useRef<string | null>(null);

  // 选中：只更新 activeId；activeMeta 由 useMemo(tree, activeId) 推导；selectNote 引用保持稳定，避免侧栏 memo 陈旧闭包
  // 不清空 editorPayload：让 Vditor 实例复用 + 上一篇内容暂留在编辑器里（由 .loading 蒙层遮盖），
  // 新内容到位后再触发一次 setValue。
  // 避免「key 变 → 销毁旧 Vditor + 创建新 Vditor（空）+ 内容到达再 setValue」的三重同步开销，
  // 这在 StrictMode dev 下会被双重挂载放大到 1～2 秒主线程冻结，正是「点击便签卡死」的元凶。
  const selectNote = useCallback((id: string) => {
    // 不能用 selectionTokenRef === id 作为「跳过」条件：token 在请求发出前就写入，若 getNoteContent 失败/
    // 被竞态丢弃，用户再点同一便签会永远 return，正文一直 loading，像卡死。仅在已选中且正文已到位时跳过。
    if (activeIdRef.current === id && editorPayloadRef.current?.id === id) return;
    selectionTokenRef.current = id;

    setActiveId(id);
    setTagInputId(null);

    const pending = pendingContentRef.current;
    if (pending && pending.id && pending.id !== id) {
      pendingContentRef.current = null;
      api.saveNote(pending.id, pending.content).catch(() => {});
    }

    api
      .getNoteContent(id)
      .then((content) => {
        if (selectionTokenRef.current === id) {
          setEditorPayload({ id, content });
        }
      })
      .catch(() => {});
  }, []);

  // 展开父目录链（子项多时整树重绘较重，用 transition 避免卡死主线程上的其它交互）
  const expandParents = useCallback((parent: string) => {
    if (!parent) return;
    startTransition(() => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        const parts = parent.split("/");
        for (let i = 1; i <= parts.length; i++) {
          next.add(parts.slice(0, i).join("/"));
        }
        return next;
      });
    });
  }, []);

  // 快速创建便签：直接走后端默认名「未命名便签」，不弹窗，立刻选中
  const quickCreateNote = useCallback(
    async (parent: string) => {
      try {
        const meta = await api.createNote({ parent });
        await loadTree();
        if (parent) expandParents(parent);
        selectNote(meta.id);
        // 创建后立刻进入重命名（让用户改名；不改也无所谓，名字已是默认）
      } catch (err) {
        console.error("create note failed:", err);
      }
    },
    [loadTree, expandParents, selectNote]
  );

  // 打开 inline 创建文件夹（在 parent 下展开一行 input）
  const openCreateFolder = useCallback(
    (parent: string) => {
      if (parent) expandParents(parent);
      setPendingFolder({ parent });
    },
    [expandParents]
  );

  // 提交 inline 创建文件夹（name 为空 = 取消）
  const submitCreateFolder = useCallback(
    async (parent: string, name: string) => {
      setPendingFolder(null);
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const node = await api.createFolder({ parent, name: trimmed });
        await loadTree();
        if (node.type === "folder") {
          setExpandedPaths((prev) => new Set(prev).add(node.path));
        }
      } catch (err) {
        console.error("create folder failed:", err);
      }
    },
    [loadTree]
  );

  const cancelCreateFolder = useCallback(() => setPendingFolder(null), []);

  // 触发重命名（双击 / F2 / 右键菜单）
  const requestRename = useCallback((node: NoteTreeNode) => {
    if (node.type === "note") {
      setRenamingTarget({ key: node.id, kind: "note", initialName: node.name });
    } else {
      setRenamingTarget({ key: node.path, kind: "folder", initialName: node.name });
    }
  }, []);

  // 提交 inline 重命名
  const submitRename = useCallback(
    async (target: RenamingTarget, newName: string) => {
      setRenamingTarget(null);
      const trimmed = newName.trim();
      if (!trimmed || trimmed === target.initialName) return;
      try {
        if (target.kind === "note") {
          const updated = await api.renameNote(target.key, trimmed);
          // 把缓存里的 Vditor 实例搬到新 id 下,光标位置与正文都保留
          renameEditorCache(target.key, updated.id);
          await loadTree();
          if (activeId === target.key) {
            setActiveId(updated.id);
            // editorPayload.id 同步到新 id（内容不变,仅路径变了)；否则下方编辑器
            // 因 editorPayload.id !== activeMeta.id 一直显示 loading 蒙层
            setEditorPayload((prev) =>
              prev && prev.id === target.key ? { ...prev, id: updated.id } : prev
            );
          }
        } else {
          const oldPath = target.key;
          const newPath = await api.renameFolder(oldPath, trimmed);
          await loadTree();
          setExpandedPaths((prev) => {
            const next = new Set<string>();
            for (const p of prev) {
              if (p === oldPath) next.add(newPath);
              else if (p.startsWith(oldPath + "/"))
                next.add(newPath + p.substring(oldPath.length));
              else next.add(p);
            }
            return next;
          });
          if (activeId && (activeId === oldPath || activeId.startsWith(oldPath + "/"))) {
            const newId = newPath + activeId.substring(oldPath.length);
            // 当前活动便签的 id 前缀变了,搬运对应的 Vditor 缓存
            renameEditorCache(activeId, newId);
            setActiveId(newId);
            // 文件夹改名后,激活便签的 id 前缀也变了；同步 editorPayload 避免 loading 蒙层卡住
            setEditorPayload((prev) => {
              if (!prev) return prev;
              if (prev.id === oldPath || prev.id.startsWith(oldPath + "/")) {
                return { ...prev, id: newPath + prev.id.substring(oldPath.length) };
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.error("rename failed:", err);
      }
    },
    [loadTree, activeId]
  );

  const cancelRename = useCallback(() => setRenamingTarget(null), []);

  const handleCreateChild = useCallback(
    (parent: string, kind: "note" | "folder") => {
      if (kind === "note") quickCreateNote(parent);
      else openCreateFolder(parent);
    },
    [quickCreateNote, openCreateFolder]
  );

  // 文件夹展开/收起（同上：大目录一次挂载上千 DOM + React 协调会长时间阻塞）
  const toggleFolder = useCallback((path: string) => {
    startTransition(() => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    });
  }, []);

  // 自动保存：写盘后 loadTree 刷新索引与侧栏；activeMeta 随 tree 自动一致
  // noteId 由编辑器闭包带过来 — 快速切便签也不会把 A 的内容写到 B
  const handleContentChange = useCallback(
    async (id: string, markdown: string) => {
      try {
        await api.saveNote(id, markdown);
        if (id === activeIdRef.current) {
          setLastSavedAt(new Date().toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US"));
        }
        if (pendingContentRef.current?.id === id) {
          pendingContentRef.current = null;
        }
        startTransition(() => {
          void loadTree();
        });
      } catch {
        // 静默
      }
    },
    [language, loadTree]
  );

  const handlePendingChange = useCallback((id: string, markdown: string) => {
    pendingContentRef.current = { id, content: markdown };
  }, []);

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, node: NoteTreeNode | null) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  // 稳定的关闭引用，避免 ContextMenu 每次重渲染都重新绑 document 事件
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /** 侧栏空白处右键：不在树行 / 搜索行 / 空状态块内时，等同根目录空白菜单 */
  const handleNotesListBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (showTrash || searchResults) return;
      const el = e.target as HTMLElement;
      if (el.closest(".note-tree-row, .notes-item, .notes-empty, .notes-search-results")) return;
      e.preventDefault();
      handleContextMenu(e, null);
    },
    [showTrash, searchResults, handleContextMenu]
  );

  const openNotesTrash = useCallback(() => {
    setShowTrash(true);
    void loadTrashed();
  }, [loadTrashed]);

  // 删除
  const handleDeleteConfirmed = useCallback(
    async (node: NoteTreeNode) => {
      try {
        if (node.type === "note") {
          await api.deleteNote(node.id);
          dropEditorCache(node.id);
          if (activeId === node.id) {
            selectionTokenRef.current = null;
            setActiveId(null);
            setEditorPayload(null);
          }
        } else {
          await api.deleteFolder(node.path);
          // 文件夹下的便签缓存条目暂时留存,会被后续 LRU 自然淘汰,不影响功能
          if (activeId && activeId.startsWith(node.path + "/")) {
            dropEditorCache(activeId);
            selectionTokenRef.current = null;
            setActiveId(null);
            setEditorPayload(null);
          }
        }
        await Promise.all([loadTree(), loadTrashed()]);
      } finally {
        setConfirmDelete(null);
      }
    },
    [activeId, loadTree, loadTrashed]
  );

  // 置顶
  const togglePin = useCallback(
    async (id: string, currentPinned: boolean) => {
      try {
        await api.updateNoteMeta(id, { pinned: !currentPinned });
        await loadTree();
      } catch {}
    },
    [loadTree]
  );

  // Tags
  const addTag = useCallback(
    async (id: string, tag: string) => {
      const meta = findNoteInTree(tree, id);
      if (!meta || meta.tags.includes(tag)) return;
      await api.updateNoteMeta(id, { tags: [...meta.tags, tag] });
      await loadTree();
    },
    [tree, loadTree]
  );

  const removeTag = useCallback(
    async (id: string, tag: string) => {
      const meta = findNoteInTree(tree, id);
      if (!meta) return;
      await api.updateNoteMeta(id, { tags: meta.tags.filter((x) => x !== tag) });
      await loadTree();
    },
    [tree, loadTree]
  );

  // 回收站
  const handleRestore = useCallback(
    async (trashId: string) => {
      await api.restoreNote(trashId);
      await Promise.all([loadTree(), loadTrashed()]);
    },
    [loadTree, loadTrashed]
  );
  const handlePermanentDelete = useCallback(
    async (trashId: string) => {
      await api.permanentlyDeleteNote(trashId);
      await loadTrashed();
    },
    [loadTrashed]
  );
  const handleEmptyTrash = useCallback(async () => {
    await api.emptyNotesTrash();
    await loadTrashed();
    setEmptyTrashConfirm(false);
  }, [loadTrashed]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inEditableField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (e.key === "F11") {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }
      if (e.key === "Escape" && focusMode && !inEditableField) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }
      if (inEditableField) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        openCreateFolder("");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        quickCreateNote("");
      }
      if (e.key === "F2" && activeMeta) {
        e.preventDefault();
        requestRename({ ...activeMeta, type: "note" } as NoteTreeNode);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p" && activeMeta) {
        e.preventDefault();
        togglePin(activeMeta.id, activeMeta.pinned);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [quickCreateNote, openCreateFolder, requestRename, activeMeta, togglePin, focusMode]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 1) return language === "zh" ? "刚刚" : "just now";
    if (diff < 60) return `${diff}${language === "zh" ? "分钟前" : "m ago"}`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}${language === "zh" ? "小时前" : "h ago"}`;
    return d.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US");
  };

  const sortedSearchResults = useMemo(() => {
    if (!searchResults) return [];
    return [...searchResults].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [searchResults]);

  return (
    <div className={focusMode ? "notes-view notes-view-focus" : "notes-view"}>
      {/* 左侧侧栏 */}
      <div className="notes-sidebar">
        <div className="notes-toolbar">
          <div className="notes-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="notes-search-clear" onClick={() => setSearchQuery("")}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="notes-list" onContextMenu={handleNotesListBackgroundContextMenu}>
          {showTrash ? (
            <TrashList
              items={trashedNotes}
              t={t}
              language={language}
              formatTime={formatTime}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              emptyTrashConfirm={emptyTrashConfirm}
              setEmptyTrashConfirm={setEmptyTrashConfirm}
              onEmptyTrash={handleEmptyTrash}
              onBackToTree={() => setShowTrash(false)}
            />
          ) : searchResults ? (
            <SearchResults
              results={sortedSearchResults}
              activeId={activeId}
              onSelect={selectNote}
              t={t}
              language={language}
              formatTime={formatTime}
            />
          ) : tree.length === 0 && !pendingFolder ? (
            <div className="notes-empty" onContextMenu={(e) => handleContextMenu(e, null)}>
              <StickyNote size={32} />
              <p>{t.noNotes}</p>
              <p className="muted small">{t.noNotesBody}</p>
            </div>
          ) : (
            <NoteTree
              nodes={tree}
              expandedPaths={expandedPaths}
              onSelect={selectNote}
              onToggleFolder={toggleFolder}
              onCreateChild={handleCreateChild}
              onContextMenu={handleContextMenu}
              onRequestRename={requestRename}
              pendingFolder={pendingFolder}
              onSubmitFolder={submitCreateFolder}
              onCancelFolder={cancelCreateFolder}
              renamingTarget={renamingTarget}
              onSubmitRename={submitRename}
              onCancelRename={cancelRename}
              language={language}
            />
          )}
        </div>
      </div>

      {/* 右侧编辑区 */}
      <div className="notes-editor-area">
        {activeMeta ? (
          <>
            <div className="notes-editor-topbar">
              <div className="notes-editor-meta">
                <span className="notes-breadcrumb" title={activeMeta.id}>
                  {activeMeta.parent ? activeMeta.parent + " / " : ""}
                  <strong>{activeMeta.title || activeMeta.name}</strong>
                </span>
                <div className="notes-tags-editor">
                  {activeMeta.tags.map((tag) => (
                    <span key={tag} className="notes-tag-chip">
                      {tag}
                      <button
                        className="notes-tag-remove"
                        onClick={() => removeTag(activeMeta.id, tag)}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {tagInputId === activeMeta.id ? (
                    <input
                      className="notes-tag-input"
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagInputValue.trim()) {
                          addTag(activeMeta.id, tagInputValue.trim());
                          setTagInputValue("");
                        }
                        if (e.key === "Escape") {
                          setTagInputId(null);
                          setTagInputValue("");
                        }
                      }}
                      onBlur={() => {
                        if (tagInputValue.trim()) addTag(activeMeta.id, tagInputValue.trim());
                        setTagInputId(null);
                        setTagInputValue("");
                      }}
                      placeholder={t.tagPlaceholder}
                      autoFocus
                    />
                  ) : (
                    <button
                      className="notes-tag-add"
                      onClick={() => setTagInputId(activeMeta.id)}
                    >
                      <Tag size={11} />
                      {t.addTag}
                    </button>
                  )}
                </div>
              </div>
              <div className="notes-editor-actions">
                {lastSavedAt && (
                  <span className="muted small">
                    {t.lastSaved}: {lastSavedAt}
                  </span>
                )}
                <button
                  className="notes-focus-toggle"
                  onClick={() => setOutlineVisible((v) => !v)}
                  title={outlineVisible ? t.hideOutline : t.showOutline}
                >
                  {outlineVisible ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
                </button>
                <button
                  className="notes-focus-toggle"
                  onClick={() => setFocusMode((v) => !v)}
                  title={focusMode ? t.exitFocus : t.enterFocus}
                >
                  {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
            <div
              className={
                editorPayload && editorPayload.id === activeMeta.id
                  ? "notes-editor-content"
                  : "notes-editor-content loading"
              }
            >
              <EditorErrorBoundary
                resetKey={editorPayload?.id ?? activeMeta.id}
                fallbackText={language === "zh" ? "编辑器临时出错" : "Editor crashed"}
              >
                {/* noteId/content 都跟 editorPayload —— 编辑器只在内容真正到位时才存在并 setValue,
                    避免「先 setValue('') 再 setValue(内容)」的双重同步开销;
                    Vditor 实例复用(无 key 强制重建),切换便签时 useLayoutEffect 走一次 setValue 即可。
                    新内容到位前 .loading 蒙层会盖住编辑区,用户不会看到「上一篇内容残留」的混乱。 */}
                {editorPayload ? (
                  <NoteEditor
                    noteId={editorPayload.id}
                    content={editorPayload.content}
                    onContentChange={handleContentChange}
                    onPendingChange={handlePendingChange}
                    language={language}
                    showOutline={outlineVisible}
                  />
                ) : null}
              </EditorErrorBoundary>
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

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={buildContextMenuItems({
            node: contextMenu.node,
            t,
            quickCreateNote,
            openCreateFolder,
            requestRename,
            togglePin,
            setConfirmDelete,
            openNotesTrash,
          })}
        />
      )}

      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <div className="notes-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="notes-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <AlertTriangle size={18} />
              <span>
                {confirmDelete.type === "folder" ? t.deleteFolderConfirm : t.deleteNoteConfirm}
              </span>
            </div>
            <div className="notes-modal-body muted small">
              {confirmDelete.type === "folder"
                ? confirmDelete.path
                : (confirmDelete as NoteMeta).id}
            </div>
            <div className="notes-modal-actions">
              <button className="compact-button" onClick={() => setConfirmDelete(null)}>
                {language === "zh" ? "取消" : "Cancel"}
              </button>
              <button className="compact-button danger" onClick={() => handleDeleteConfirmed(confirmDelete)}>
                {language === "zh" ? "删除" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────

interface BuildMenuArgs {
  node: NoteTreeNode | null;
  t: typeof labels.zh;
  quickCreateNote: (parent: string) => void;
  openCreateFolder: (parent: string) => void;
  requestRename: (node: NoteTreeNode) => void;
  togglePin: (id: string, currentPinned: boolean) => void;
  setConfirmDelete: (node: NoteTreeNode) => void;
  openNotesTrash: () => void;
}

function buildContextMenuItems({
  node,
  t,
  quickCreateNote,
  openCreateFolder,
  requestRename,
  togglePin,
  setConfirmDelete,
  openNotesTrash,
}: BuildMenuArgs): ContextMenuItem[] {
  // 空白处右键 = 在根目录创建 + 进入回收站（顶部回收站入口已移除）
  if (!node) {
    return [
      { label: t.newNote, icon: <FileText size={14} />, onClick: () => quickCreateNote("") },
      { label: t.newFolder, icon: <FolderPlus size={14} />, onClick: () => openCreateFolder("") },
      { divider: true },
      { label: t.trash, icon: <Trash2 size={14} />, onClick: () => openNotesTrash() },
    ];
  }
  if (node.type === "folder") {
    return [
      { label: t.newNote, icon: <FileText size={14} />, onClick: () => quickCreateNote(node.path) },
      { label: t.newFolder, icon: <FolderPlus size={14} />, onClick: () => openCreateFolder(node.path) },
      { divider: true },
      { label: t.rename, icon: <Pencil size={14} />, onClick: () => requestRename(node) },
      { label: t.delete, icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(node) },
    ];
  }
  // note
  return [
    {
      label: node.pinned ? t.unpin : t.pin,
      icon: node.pinned ? <PinOff size={14} /> : <Pin size={14} />,
      onClick: () => togglePin(node.id, node.pinned),
    },
    { label: t.rename, icon: <Pencil size={14} />, onClick: () => requestRename(node) },
    { divider: true },
    { label: t.delete, icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(node) },
  ];
}

interface SearchResultsProps {
  results: NoteMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  t: typeof labels.zh;
  language: Language;
  formatTime: (iso: string) => string;
}
function SearchResults({ results, activeId, onSelect, t, language, formatTime }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="notes-empty">
        <Search size={28} />
        <p>{t.noResults}</p>
      </div>
    );
  }
  return (
    <div className="notes-search-results">
      <div className="notes-search-results-header">
        {t.searchResults} ({results.length})
      </div>
      {results.map((note) => (
        <div
          key={note.id}
          className={"notes-item" + (activeId === note.id ? " active" : "")}
          // 与 NoteTree 一致：阻止默认 mousedown 抢焦点，避免 vditor blur 触发 Lute 整篇 IR→MD 同步卡死主线程
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(note.id)}
        >
          <div className="notes-item-header">
            <FileText size={14} className="notes-item-icon" />
            <span className="notes-item-title">{note.title || note.name}</span>
            {note.pinned && <Pin size={12} className="notes-item-pin" />}
          </div>
          {note.parent && <div className="notes-item-snippet muted small">{note.parent}</div>}
          {note.snippet && <div className="notes-item-snippet">{note.snippet}</div>}
          <div className="notes-item-meta">
            <span className="muted small">{formatTime(note.updatedAt)}</span>
          </div>
        </div>
      ))}
      <div className="muted small" style={{ padding: "8px 12px", textAlign: "center" }}>
        {language === "zh" ? "（按路径搜索 / 标题 / 标签 / 内容）" : "(searches path / title / tags / content)"}
      </div>
    </div>
  );
}

interface TrashListProps {
  items: TrashedNote[];
  t: typeof labels.zh;
  language: Language;
  formatTime: (iso: string) => string;
  onRestore: (trashId: string) => void;
  onPermanentDelete: (trashId: string) => void;
  emptyTrashConfirm: boolean;
  setEmptyTrashConfirm: (v: boolean) => void;
  onEmptyTrash: () => void;
  onBackToTree: () => void;
}
function TrashList({
  items,
  t,
  language,
  formatTime,
  onRestore,
  onPermanentDelete,
  emptyTrashConfirm,
  setEmptyTrashConfirm,
  onEmptyTrash,
  onBackToTree,
}: TrashListProps) {
  if (items.length === 0) {
    return (
      <div className="notes-empty">
        <button type="button" className="notes-trash-back-btn" onClick={onBackToTree}>
          <ChevronLeft size={18} />
          {t.backToTree}
        </button>
        <Trash2 size={32} />
        <p>{t.trashEmpty}</p>
      </div>
    );
  }
  return (
    <>
      <div className="notes-trash-back-row">
        <button type="button" className="notes-trash-back-btn" onClick={onBackToTree}>
          <ChevronLeft size={18} />
          {t.backToTree}
        </button>
      </div>
      {items.map((item) => (
        <div key={item.trashId} className="notes-item notes-trash-item">
          <div className="notes-item-header">
            <FileText size={14} className="notes-item-icon" />
            <span className="notes-item-title">{item.meta.title || item.meta.name}</span>
          </div>
          <div className="notes-item-meta">
            <span className="muted small" title={item.originalPath}>
              {item.originalPath}
            </span>
          </div>
          <div className="notes-item-meta">
            <span className="muted small">{formatTime(item.deletedAt)}</span>
          </div>
          <div className="notes-item-actions" style={{ display: "flex" }}>
            <button
              className="notes-action-btn"
              onClick={() => onRestore(item.trashId)}
              title={t.restore}
            >
              <RotateCcw size={13} />
            </button>
            <button
              className="notes-action-btn danger"
              onClick={() => onPermanentDelete(item.trashId)}
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
              <AlertTriangle size={14} style={{ verticalAlign: "-2px" }} /> {t.emptyTrashConfirm}
            </span>
            <div className="notes-delete-confirm-btns">
              <button className="compact-button danger" onClick={onEmptyTrash}>
                {t.emptyTrash}
              </button>
              <button className="compact-button" onClick={() => setEmptyTrashConfirm(false)}>
                {language === "zh" ? "取消" : "Cancel"}
              </button>
            </div>
          </div>
        ) : (
          <button className="notes-trash-empty-btn" onClick={() => setEmptyTrashConfirm(true)}>
            {t.emptyTrash}
          </button>
        )}
      </div>
    </>
  );
}
