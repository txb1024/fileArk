import { useEffect, useMemo, useState } from "react";
import { Folder, FileText } from "lucide-react";
import { base64ToUint8Array, formatSize } from "./utils";

interface ArchiveEntry {
  path: string;
  size: number;
  isDir: boolean;
  date: Date | null;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: TreeNode[];
  date: Date | null;
}

function buildTree(entries: ArchiveEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, size: 0, children: [], date: null };
  for (const e of entries) {
    const parts = e.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const partName = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === partName);
      if (!child) {
        child = {
          name: partName,
          path,
          isDir: !isLast || e.isDir,
          size: isLast ? e.size : 0,
          children: [],
          date: isLast ? e.date : null,
        };
        node.children.push(child);
      } else if (isLast && !e.isDir) {
        child.size = e.size;
        child.date = e.date;
        child.isDir = false;
      }
      node = child;
    }
  }
  // 排序：目录在前、按名字
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sortRec(c);
  };
  sortRec(root);
  return root;
}

function TreeRow({ node, depth, expanded, toggle }: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  return (
    <>
      <div
        className={`archive-row ${node.isDir ? "is-dir" : ""}`}
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => node.isDir && toggle(node.path)}
      >
        <span className="archive-icon">
          {node.isDir ? <Folder size={14} /> : <FileText size={14} />}
        </span>
        <span className="archive-name">{node.name}</span>
        <span className="archive-size">{node.isDir ? "" : formatSize(node.size)}</span>
        <span className="archive-date">
          {node.date ? node.date.toLocaleDateString() : ""}
        </span>
      </div>
      {isOpen && node.children.map((c) => (
        <TreeRow key={c.path} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} />
      ))}
    </>
  );
}

export function ArchivePreview({ base64 }: { base64: string }) {
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    import("jszip")
      .then(({ default: JSZip }) => {
        if (cancelled) return;
        const bytes = base64ToUint8Array(base64);
        JSZip.loadAsync(bytes)
          .then((zip) => {
            if (cancelled) return;
            const list: ArchiveEntry[] = [];
            zip.forEach((relativePath, file) => {
              const data = (file as unknown as { _data?: { uncompressedSize?: number } })._data;
              list.push({
                path: relativePath,
                size: data?.uncompressedSize ?? 0,
                isDir: file.dir,
                date: file.date || null,
              });
            });
            setEntries(list);
          })
          .catch((e) => {
            if (!cancelled) setError(String(e));
          });
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64]);

  const tree = useMemo(() => (entries ? buildTree(entries) : null), [entries]);
  const stats = useMemo(() => {
    if (!entries) return null;
    const fileCount = entries.filter((e) => !e.isDir).length;
    const totalSize = entries.reduce((acc, e) => acc + e.size, 0);
    return { fileCount, totalSize, dirCount: entries.length - fileCount };
  }, [entries]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (error) {
    return (
      <div className="preview-error">
        <p>压缩包解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (!tree || !stats) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>读取压缩包...</span>
      </div>
    );
  }

  return (
    <div className="preview-archive-container">
      <div className="archive-toolbar">
        <span className="archive-meta">
          {stats.fileCount} 个文件 · {stats.dirCount} 个目录 · 解压后 {formatSize(stats.totalSize)}
        </span>
        <div className="archive-toolbar-actions">
          <button
            className="compact-button secondary"
            onClick={() => {
              const all = new Set<string>();
              const collect = (n: TreeNode) => {
                if (n.isDir && n.path) all.add(n.path);
                n.children.forEach(collect);
              };
              collect(tree);
              setExpanded(all);
            }}
          >
            全部展开
          </button>
          <button className="compact-button secondary" onClick={() => setExpanded(new Set())}>
            全部折叠
          </button>
        </div>
      </div>
      <div className="archive-tree">
        {tree.children.map((c) => (
          <TreeRow key={c.path} node={c} depth={0} expanded={expanded} toggle={toggle} />
        ))}
      </div>
    </div>
  );
}
