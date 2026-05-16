import { FileText, FolderPlus, RotateCcw, StickyNote, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Messages, TrashItem, TrashedFile, TrashedNote } from "../types";

interface TrashViewProps {
  t: Messages;
  /** 当前活跃工作空间 id；切换后此 prop 变化 → 重新拉取项目 / 项目文件回收站
   *  (便签功能不区分工作空间,但顺手也会被一起 refresh,无副作用) */
  workspaceKey?: string;
  /** 项目从回收站恢复后，App.tsx 重新 fetch AppData 让侧栏即时刷新 */
  onProjectRestored?: () => Promise<void> | void;
  /** 项目被永久删除 / 清空回收站后，同上 */
  onProjectsTrashChanged?: () => Promise<void> | void;
}

const RETENTION_DAYS = 30;

/**
 * 统一回收站视图：三栏分组展示
 *  1) 整个项目（旧逻辑，仍由 App.tsx 那边 setData 联动）
 *  2) 项目内被删除的文件 / 文件夹（delete_file 现在走回收站）
 *  3) 被删除的便签（与 NotesView 内部的回收站面板共享数据源）
 *
 * 所有条目保留 30 天，到期后由后端 cleanup_expired_trash 自动永久清理。
 */
export function TrashView({
  t,
  workspaceKey,
  onProjectRestored,
  onProjectsTrashChanged,
}: TrashViewProps) {
  const [projects, setProjects] = useState<TrashItem[]>([]);
  const [files, setFiles] = useState<TrashedFile[]>([]);
  const [notes, setNotes] = useState<TrashedNote[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  const refresh = useCallback(async () => {
    const [p, f, n] = await Promise.all([
      api.getTrashItems(),
      api.listTrashedFiles(),
      api.listTrashedNotes(),
    ]);
    setProjects(p);
    setFiles(f);
    setNotes(n);
  }, []);

  // 挂载 + 工作空间切换时重新拉取
  useEffect(() => {
    refresh();
  }, [refresh, workspaceKey]);

  // ── 项目（整个） ────────────────────────────────────────
  const restoreProject = useCallback(
    async (trashItemId: string) => {
      await api.restoreProject(trashItemId);
      await refresh();
      if (onProjectRestored) await onProjectRestored();
    },
    [refresh, onProjectRestored],
  );

  const permanentlyDeleteProject = useCallback(
    async (trashItemId: string) => {
      await api.permanentlyDeleteTrashItem(trashItemId);
      await refresh();
      if (onProjectsTrashChanged) await onProjectsTrashChanged();
    },
    [refresh, onProjectsTrashChanged],
  );

  const emptyAll = useCallback(async () => {
    // 三类全部清空
    await Promise.all([
      api.emptyTrash(),
      Promise.all(files.map((f) => api.permanentlyDeleteTrashedFile(f.id))),
      api.emptyNotesTrash(),
    ]);
    setConfirmingEmpty(false);
    await refresh();
    if (onProjectsTrashChanged) await onProjectsTrashChanged();
  }, [files, refresh, onProjectsTrashChanged]);

  // ── 项目内文件 ──────────────────────────────────────────
  const restoreFile = useCallback(
    async (fileId: string) => {
      await api.restoreTrashedFile(fileId);
      await refresh();
    },
    [refresh],
  );

  const permanentlyDeleteFile = useCallback(
    async (fileId: string) => {
      await api.permanentlyDeleteTrashedFile(fileId);
      await refresh();
    },
    [refresh],
  );

  // ── 便签 ─────────────────────────────────────────────────
  const restoreNote = useCallback(
    async (trashId: string) => {
      await api.restoreNote(trashId);
      await refresh();
    },
    [refresh],
  );

  const permanentlyDeleteNote = useCallback(
    async (trashId: string) => {
      await api.permanentlyDeleteNote(trashId);
      await refresh();
    },
    [refresh],
  );

  const total = projects.length + files.length + notes.length;

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-group">
          <h1>{t.trash}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            回收站中的条目保留 {RETENTION_DAYS} 天，到期后自动永久删除。
          </p>
        </div>
        {total > 0 &&
          (confirmingEmpty ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary compact-button" onClick={() => setConfirmingEmpty(false)}>
                取消
              </button>
              <button className="danger compact-button" onClick={emptyAll}>
                <Trash2 size={16} />
                确认清空全部
              </button>
            </div>
          ) : (
            <button className="danger" onClick={() => setConfirmingEmpty(true)}>
              <Trash2 size={16} />
              {t.emptyTrash}
            </button>
          ))}
      </div>

      {total === 0 ? (
        <div className="empty-state">
          <Trash2 size={48} strokeWidth={1} />
          <h3>{t.trashEmpty}</h3>
          <p>{t.trashEmptyBody}</p>
        </div>
      ) : (
        <>
          <Section
            title="项目"
            icon={<FolderPlus size={14} />}
            count={projects.length}
            empty={projects.length === 0}
          >
            {projects.map((item) => (
              <TrashRow
                key={item.id}
                name={item.name}
                meta={[`${t.deletedAt}: ${item.deletedAt}`, item.originalPath]}
                confirmingDelete={confirmingId === item.id}
                onRestore={() => restoreProject(item.id)}
                onAskDelete={() => setConfirmingId(item.id)}
                onConfirmDelete={() => {
                  permanentlyDeleteProject(item.id);
                  setConfirmingId(null);
                }}
                restoreLabel={t.restoreProject}
                permanentLabel={t.permanentlyDelete}
              />
            ))}
          </Section>

          <Section
            title="项目内的文件"
            icon={<FileText size={14} />}
            count={files.length}
            empty={files.length === 0}
          >
            {files.map((item) => (
              <TrashRow
                key={item.id}
                name={item.name}
                meta={[
                  `${t.deletedAt}: ${item.deletedAt}`,
                  item.projectName ? `来源：${item.projectName}${item.category ? ` / ${item.category}` : ""}` : item.originalPath,
                ]}
                confirmingDelete={confirmingId === item.id}
                onRestore={() => restoreFile(item.id)}
                onAskDelete={() => setConfirmingId(item.id)}
                onConfirmDelete={() => {
                  permanentlyDeleteFile(item.id);
                  setConfirmingId(null);
                }}
                restoreLabel="恢复"
                permanentLabel={t.permanentlyDelete}
              />
            ))}
          </Section>

          <Section
            title="便签"
            icon={<StickyNote size={14} />}
            count={notes.length}
            empty={notes.length === 0}
          >
            {notes.map((item) => (
              <TrashRow
                key={item.trashId}
                name={item.meta.title || item.meta.name}
                meta={[`${t.deletedAt}: ${item.deletedAt}`, item.originalPath]}
                confirmingDelete={confirmingId === item.trashId}
                onRestore={() => restoreNote(item.trashId)}
                onAskDelete={() => setConfirmingId(item.trashId)}
                onConfirmDelete={() => {
                  permanentlyDeleteNote(item.trashId);
                  setConfirmingId(null);
                }}
                restoreLabel="恢复"
                permanentLabel={t.permanentlyDelete}
              />
            ))}
          </Section>
        </>
      )}
    </section>
  );
}

function Section({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (empty) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div
        className="muted small"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "0 0 8px 4px",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {icon}
        <span>{title}</span>
        <span>· {count}</span>
      </div>
      <div className="trash-list">{children}</div>
    </div>
  );
}

function TrashRow({
  name,
  meta,
  confirmingDelete,
  onRestore,
  onAskDelete,
  onConfirmDelete,
  restoreLabel,
  permanentLabel,
}: {
  name: string;
  meta: string[];
  confirmingDelete: boolean;
  onRestore: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  restoreLabel: string;
  permanentLabel: string;
}) {
  return (
    <div className="trash-item">
      <div className="trash-item-info">
        <div className="trash-item-name">{name}</div>
        <div className="trash-item-meta">
          {meta.filter(Boolean).map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>
      <div className="trash-item-actions">
        <button className="secondary compact-button" onClick={onRestore}>
          <RotateCcw size={16} />
          {restoreLabel}
        </button>
        {confirmingDelete ? (
          <button className="danger compact-button" onClick={onConfirmDelete}>
            <Trash2 size={16} />
            确认删除？
          </button>
        ) : (
          <button className="secondary compact-button danger-hover" onClick={onAskDelete}>
            <Trash2 size={16} />
            {permanentLabel}
          </button>
        )}
      </div>
    </div>
  );
}
