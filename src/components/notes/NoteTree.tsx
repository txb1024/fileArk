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
import { memo, useEffect, useRef } from "react";
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

interface NoteTreeProps {
  nodes: NoteTreeNode[];
  activeId: string | null;
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
  const { nodes, depth = 0, pendingFolder } = props;
  const showRootPending = depth === 0 && pendingFolder?.parent === "";
  if (nodes.length === 0 && depth === 0 && !showRootPending) return null;
  return (
    <div className="note-tree" role="tree">
      {showRootPending && (
        <InlineFolderInput
          parent=""
          depth={0}
          onSubmit={props.onSubmitFolder}
          onCancel={props.onCancelFolder}
          language={props.language}
        />
      )}
      {nodes.map((node) => (
        <NoteTreeItem key={getKey(node)} node={node} depth={depth} {...props} />
      ))}
    </div>
  );
}

export const NoteTree = memo(NoteTreeBase);

function getKey(node: NoteTreeNode): string {
  return node.type === "folder" ? `f:${node.path}` : `n:${node.id}`;
}

interface ItemProps extends NoteTreeProps {
  node: NoteTreeNode;
  depth: number;
}

function NoteTreeItem(props: ItemProps) {
  const { node, depth } = props;
  if (node.type === "folder") return <FolderRow {...props} node={node} depth={depth} />;
  return <NoteRow {...props} node={node} depth={depth} />;
}

function FolderRow(props: ItemProps & { node: NoteFolderNode }) {
  const {
    node,
    depth,
    expandedPaths,
    onToggleFolder,
    onCreateChild,
    onContextMenu,
    onRequestRename,
    pendingFolder,
    renamingTarget,
    onSubmitFolder,
    onCancelFolder,
    onSubmitRename,
    onCancelRename,
    language,
  } = props;
  const expanded = expandedPaths.has(node.path);
  const isRenaming = renamingTarget?.kind === "folder" && renamingTarget.key === node.path;
  const showChildPending = expanded && pendingFolder?.parent === node.path;

  return (
    <>
      <div
        className="note-tree-row note-tree-folder"
        style={{ paddingLeft: 8 + depth * 14 }}
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
            initialValue={renamingTarget.initialName}
            onSubmit={(name) => onSubmitRename(renamingTarget, name)}
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
      {expanded && (showChildPending || node.children.length > 0) && (
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
          {node.children.length > 0 && (
            <NoteTree {...props} nodes={node.children} depth={depth + 1} />
          )}
        </>
      )}
    </>
  );
}

function NoteRow(props: ItemProps & { node: NoteFileNode }) {
  const {
    node,
    depth,
    activeId,
    onSelect,
    onContextMenu,
    onRequestRename,
    renamingTarget,
    onSubmitRename,
    onCancelRename,
  } = props;
  const active = activeId === node.id;
  const isRenaming = renamingTarget?.kind === "note" && renamingTarget.key === node.id;

  return (
    <div
      className={"note-tree-row note-tree-note" + (active ? " active" : "")}
      style={{ paddingLeft: 8 + depth * 14 + 13 /* 占 chevron 位置 */ }}
      onClick={() => {
        if (isRenaming) return;
        onSelect(node.id);
      }}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <FileText size={13} className="note-tree-icon" />
      {isRenaming ? (
        <InlineNameInput
          initialValue={renamingTarget.initialName}
          onSubmit={(name) => onSubmitRename(renamingTarget, name)}
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
}

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
