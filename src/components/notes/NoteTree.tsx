import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Pin,
  Plus,
  FolderPlus,
} from "lucide-react";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { NoteTreeNode, NoteFolderNode, NoteFileNode } from "../../types";

/** 树内 inline 编辑请求：创建新文件夹（parent="" 表示根目录） */
export interface PendingFolder {
  parent: string;
}

/** 树内 inline 重命名请求 */
export interface RenamingTarget {
  /** 便签传 id（路径），文件夹传 path */
  key: string;
  kind: "note" | "folder";
  /** input 预填值（当前名字） */
  initialName: string;
}

// ── 外部 store：高亮态不走 props，只「真的被高亮 / 取消高亮」的两行会重渲染 ──────
// 之前 activeId 作为 prop 顺着 NoteTree → FolderRow → NoteRow 一层层往下传，
// 每次点击便签都让整棵子树 reconcile，对几百~上千个节点就是几十~几百 ms 的阻塞。
// 现在改成：NotesView 写 store，NoteRow 用 useSyncExternalStore 选择性订阅，
// 只有 snapshot（自己是否被选中）真的变了的行才会被 React 重渲染。
const activeIdListeners = new Set<() => void>();
let activeNoteIdValue: string | null = null;

export const activeNoteIdStore = {
  get: () => activeNoteIdValue,
  set: (id: string | null) => {
    if (activeNoteIdValue === id) return;
    activeNoteIdValue = id;
    for (const fn of activeIdListeners) fn();
  },
  subscribe: (fn: () => void) => {
    activeIdListeners.add(fn);
    return () => {
      activeIdListeners.delete(fn);
    };
  },
};

function useIsActiveNote(noteId: string): boolean {
  return useSyncExternalStore(
    activeNoteIdStore.subscribe,
    () => activeNoteIdValue === noteId,
    () => false,
  );
}

interface NoteTreeProps {
  nodes: NoteTreeNode[];
  expandedPaths: Set<string>;
  onSelect: (id: string) => void;
  onToggleFolder: (path: string) => void;
  /** 单击 hover icon 时调用：在 parent 下新建便签 / 文件夹 */
  onCreateChild: (parent: string, kind: "note" | "folder") => void;
  /** 右键节点时调用，触发上下文菜单 */
  onContextMenu: (e: React.MouseEvent, node: NoteTreeNode) => void;
  /** 双击节点 → 触发重命名（由父组件决定 renamingTarget） */
  onRequestRename: (node: NoteTreeNode) => void;
  /** 当前是否在某父目录下 inline 创建文件夹 */
  pendingFolder: PendingFolder | null;
  /** inline 创建文件夹：提交（name 为空则当作取消） */
  onSubmitFolder: (parent: string, name: string) => void;
  /** inline 创建文件夹：取消（按 Esc） */
  onCancelFolder: () => void;
  /** 当前正在 inline 重命名的节点（key 与 NoteFileNode.id / NoteFolderNode.path 对应） */
  renamingTarget: RenamingTarget | null;
  /** inline 重命名：提交（name 与原名相同则当作取消） */
  onSubmitRename: (target: RenamingTarget, newName: string) => void;
  /** inline 重命名：取消 */
  onCancelRename: () => void;
  language: "zh" | "en";
  depth?: number;
}

function NoteTreeBase(props: NoteTreeProps) {
  const {
    nodes,
    depth = 0,
    expandedPaths,
    pendingFolder,
    renamingTarget,
    onSelect,
    onToggleFolder,
    onCreateChild,
    onContextMenu,
    onRequestRename,
    onSubmitFolder,
    onCancelFolder,
    onSubmitRename,
    onCancelRename,
    language,
  } = props;
  const showRootPending = depth === 0 && pendingFolder?.parent === "";
  if (nodes.length === 0 && depth === 0 && !showRootPending) return null;
  return (
    <div className="note-tree" role="tree">
      {showRootPending && (
        <InlineFolderInput
          parent=""
          depth={0}
          onSubmit={onSubmitFolder}
          onCancel={onCancelFolder}
          language={language}
        />
      )}
      {nodes.map((node) => {
        if (node.type === "folder") {
          const expanded = expandedPaths.has(node.path);
          const isRenaming =
            renamingTarget?.kind === "folder" && renamingTarget.key === node.path;
          const childPendingActive = pendingFolder?.parent === node.path;
          return (
            <FolderRow
              key={`f:${node.path}`}
              node={node}
              depth={depth}
              expanded={expanded}
              isRenaming={isRenaming}
              renamingInitialName={isRenaming ? renamingTarget!.initialName : ""}
              childPendingActive={childPendingActive}
              // 用于子树递归（仅展开时才会真正用到）
              expandedPaths={expandedPaths}
              renamingTarget={renamingTarget}
              pendingFolder={pendingFolder}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              onCreateChild={onCreateChild}
              onContextMenu={onContextMenu}
              onRequestRename={onRequestRename}
              onSubmitFolder={onSubmitFolder}
              onCancelFolder={onCancelFolder}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              language={language}
            />
          );
        }
        const isRenaming =
          renamingTarget?.kind === "note" && renamingTarget.key === node.id;
        return (
          <NoteRow
            key={`n:${node.id}`}
            node={node}
            depth={depth}
            isRenaming={isRenaming}
            renamingInitialName={isRenaming ? renamingTarget!.initialName : ""}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onRequestRename={onRequestRename}
            onSubmitRename={onSubmitRename}
            onCancelRename={onCancelRename}
          />
        );
      })}
    </div>
  );
}

export const NoteTree = memo(NoteTreeBase);

/** 超过此数量时延迟挂载子树，避免点击展开文件夹时主线程一次性协调/布局卡死 */
const DEFER_CHILDREN_THRESHOLD = 200;

function scheduleIdleOrTimeout(run: () => void, timeoutMs: number): () => void {
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 0);
  return () => clearTimeout(id);
}

interface FolderRowProps {
  node: NoteFolderNode;
  depth: number;
  expanded: boolean;
  isRenaming: boolean;
  renamingInitialName: string;
  childPendingActive: boolean;
  expandedPaths: Set<string>;
  renamingTarget: RenamingTarget | null;
  pendingFolder: PendingFolder | null;
  onSelect: (id: string) => void;
  onToggleFolder: (path: string) => void;
  onCreateChild: (parent: string, kind: "note" | "folder") => void;
  onContextMenu: (e: React.MouseEvent, node: NoteTreeNode) => void;
  onRequestRename: (node: NoteTreeNode) => void;
  onSubmitFolder: (parent: string, name: string) => void;
  onCancelFolder: () => void;
  onSubmitRename: (target: RenamingTarget, newName: string) => void;
  onCancelRename: () => void;
  language: "zh" | "en";
}

const FolderRow = memo(function FolderRowInner(props: FolderRowProps) {
  const {
    node,
    depth,
    expanded,
    isRenaming,
    renamingInitialName,
    childPendingActive,
    expandedPaths,
    renamingTarget,
    pendingFolder,
    onSelect,
    onToggleFolder,
    onCreateChild,
    onContextMenu,
    onRequestRename,
    onSubmitFolder,
    onCancelFolder,
    onSubmitRename,
    onCancelRename,
    language,
  } = props;
  const showChildPending = expanded && childPendingActive;
  const childCount = node.children.length;
  const [deferredChildrenReady, setDeferredChildrenReady] = useState(false);

  useEffect(() => {
    if (!expanded) {
      setDeferredChildrenReady(false);
      return;
    }
    if (childCount <= DEFER_CHILDREN_THRESHOLD) {
      setDeferredChildrenReady(true);
      return;
    }
    setDeferredChildrenReady(false);
    let cancelled = false;
    const cancel = scheduleIdleOrTimeout(() => {
      if (!cancelled) setDeferredChildrenReady(true);
    }, 400);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [expanded, childCount, node.path]);

  const showNestedTree =
    expanded && childCount > 0 && (childCount <= DEFER_CHILDREN_THRESHOLD || deferredChildrenReady);

  return (
    <>
      <div
        className="note-tree-row note-tree-folder"
        style={{ paddingLeft: 8 + depth * 14 }}
        // 阻止焦点从 vditor contenteditable 转移到这一行：
        // 否则 vditor blur 会同步触发 lute WASM 把整个 IR DOM 拍回 Markdown,
        // 大文档下主线程会冻住几百毫秒到几秒,看起来就像应用卡死。
        // 重命名输入框需要 focus 时不拦截。
        onMouseDown={(e) => {
          if (!isRenaming) e.preventDefault();
        }}
        onClick={() => {
          if (isRenaming) return;
          onToggleFolder(node.path);
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {expanded ? (
          <ChevronDown size={13} className="note-tree-chevron" />
        ) : (
          <ChevronRight size={13} className="note-tree-chevron" />
        )}
        {expanded ? (
          <FolderOpen size={14} className="note-tree-icon" />
        ) : (
          <Folder size={14} className="note-tree-icon" />
        )}
        {isRenaming ? (
          <InlineNameInput
            initialValue={renamingInitialName}
            onSubmit={(name) =>
              onSubmitRename(
                { key: node.path, kind: "folder", initialName: renamingInitialName },
                name,
              )
            }
            onCancel={onCancelRename}
          />
        ) : (
          <span
            className="note-tree-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRequestRename(node);
            }}
          >
            {node.name}
          </span>
        )}
        {!isRenaming && node.children.length > 0 && (
          <span className="note-tree-count">{node.children.length}</span>
        )}
        {!isRenaming && (
          <div className="note-tree-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="note-tree-action"
              title={language === "zh" ? "新建便签" : "New note"}
              onClick={() => {
                if (!expanded) onToggleFolder(node.path);
                onCreateChild(node.path, "note");
              }}
            >
              <Plus size={12} />
            </button>
            <button
              className="note-tree-action"
              title={language === "zh" ? "新建子文件夹" : "New subfolder"}
              onClick={() => {
                if (!expanded) onToggleFolder(node.path);
                onCreateChild(node.path, "folder");
              }}
            >
              <FolderPlus size={12} />
            </button>
          </div>
        )}
      </div>
      {expanded && (showChildPending || childCount > 0) && (
        <>
          {showChildPending && (
            <InlineFolderInput
              parent={node.path}
              depth={depth + 1}
              onSubmit={onSubmitFolder}
              onCancel={onCancelFolder}
              language={language}
            />
          )}
          {childCount > 0 && showNestedTree && (
            <NoteTree
              nodes={node.children}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              renamingTarget={renamingTarget}
              pendingFolder={pendingFolder}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              onCreateChild={onCreateChild}
              onContextMenu={onContextMenu}
              onRequestRename={onRequestRename}
              onSubmitFolder={onSubmitFolder}
              onCancelFolder={onCancelFolder}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              language={language}
            />
          )}
          {childCount > 0 && expanded && !showNestedTree && (
            <div
              className="note-tree-heavy-hint muted small"
              style={{ paddingLeft: 8 + (depth + 1) * 14 + 13, paddingTop: 4, paddingBottom: 8 }}
            >
              {language === "zh"
                ? `正在加载 ${childCount} 项…`
                : `Loading ${childCount} items…`}
            </div>
          )}
        </>
      )}
    </>
  );
});

interface NoteRowProps {
  node: NoteFileNode;
  depth: number;
  isRenaming: boolean;
  renamingInitialName: string;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: NoteTreeNode) => void;
  onRequestRename: (node: NoteTreeNode) => void;
  onSubmitRename: (target: RenamingTarget, newName: string) => void;
  onCancelRename: () => void;
}

const NoteRow = memo(function NoteRowInner(props: NoteRowProps) {
  const {
    node,
    depth,
    isRenaming,
    renamingInitialName,
    onSelect,
    onContextMenu,
    onRequestRename,
    onSubmitRename,
    onCancelRename,
  } = props;
  // 只有「自己被选中 / 取消选中」时才重渲染——activeId 不再走 props
  const active = useIsActiveNote(node.id);

  return (
    <div
      className={"note-tree-row note-tree-note" + (active ? " active" : "")}
      style={{ paddingLeft: 8 + depth * 14 + 13 /* 占 chevron 位置 */ }}
      // 同 FolderRow:阻止焦点离开 vditor,避免 blur 触发 lute 同步重解析。
      // 切便签是必然要做的事,后续 selectNote → setValue 会同步替换内容。
      onMouseDown={(e) => {
        if (!isRenaming) e.preventDefault();
      }}
      onClick={() => {
        if (isRenaming) return;
        onSelect(node.id);
      }}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <FileText size={13} className="note-tree-icon" />
      {isRenaming ? (
        <InlineNameInput
          initialValue={renamingInitialName}
          onSubmit={(name) =>
            onSubmitRename(
              { key: node.id, kind: "note", initialName: renamingInitialName },
              name,
            )
          }
          onCancel={onCancelRename}
        />
      ) : (
        <span
          className="note-tree-name"
          title={node.title}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRequestRename(node);
          }}
        >
          {node.title || node.name}
        </span>
      )}
      {!isRenaming && node.pinned && <Pin size={10} className="note-tree-pin" />}
    </div>
  );
});

/** 创建文件夹的 inline 输入行（带文件夹图标 + 缩进，对齐普通 FolderRow） */
function InlineFolderInput({
  parent,
  depth,
  onSubmit,
  onCancel,
  language,
}: {
  parent: string;
  depth: number;
  onSubmit: (parent: string, name: string) => void;
  onCancel: () => void;
  language: "zh" | "en";
}) {
  return (
    <div
      className="note-tree-row note-tree-folder note-tree-pending"
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={(e) => e.stopPropagation()}
    >
      <ChevronRight size={13} className="note-tree-chevron" />
      <Folder size={14} className="note-tree-icon" />
      <InlineNameInput
        initialValue=""
        placeholder={language === "zh" ? "新文件夹名" : "Folder name"}
        onSubmit={(name) => onSubmit(parent, name)}
        onCancel={onCancel}
      />
    </div>
  );
}

/** 通用的 inline 命名输入框：自动 focus + 全选；Enter 提交，Esc / blur 取消 */
function InlineNameInput({
  initialValue,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  placeholder?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 选中除扩展名外的部分（便签是 .md，文件夹无扩展），更接近 Typora/Finder
    if (initialValue) {
      const dot = initialValue.lastIndexOf(".");
      if (dot > 0) el.setSelectionRange(0, dot);
      else el.select();
    }
  }, [initialValue]);

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const v = ref.current?.value.trim() ?? "";
    onSubmit(v);
  };

  const cancel = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={ref}
      className="note-tree-rename-input"
      defaultValue={initialValue}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={() => {
        // blur 时如果还没主动 submit / cancel，按 submit 处理（空值会被父组件当取消）
        if (!submittedRef.current) submit();
      }}
    />
  );
}
