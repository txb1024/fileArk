import { FolderPlus, FolderOpen, Trash2 } from "lucide-react";
import { EmptyState, Panel } from "../components";
import type { TrashItem, Messages } from "../types";

interface TrashViewProps {
  trashItems: TrashItem[];
  t: Messages;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onEmptyTrash: () => void;
}

export function TrashView({ trashItems, t, onRestore, onPermanentDelete, onEmptyTrash }: TrashViewProps) {
  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-group">
          <h1>{t.trash}</h1>
        </div>
        {trashItems.length > 0 && (
          <button className="danger" onClick={onEmptyTrash}>
            <Trash2 size={16} />
            {t.emptyTrash}
          </button>
        )}
      </div>

      {trashItems.length === 0 ? (
        <div className="empty-state">
          <Trash2 size={48} strokeWidth={1} />
          <h3>{t.trashEmpty}</h3>
          <p>{t.trashEmptyBody}</p>
        </div>
      ) : (
        <div className="trash-list">
          {trashItems.map((item) => (
            <div className="trash-item" key={item.id}>
              <div className="trash-item-info">
                <div className="trash-item-name">{item.name}</div>
                <div className="trash-item-meta">
                  <span>
                    {t.deletedAt}: {item.deletedAt}
                  </span>
                </div>
              </div>
              <div className="trash-item-actions">
                <button className="secondary compact-button" onClick={() => onRestore(item.id)}>
                  <FolderPlus size={16} />
                  {t.restoreProject}
                </button>
                <button className="danger compact-button" onClick={() => onPermanentDelete(item.id)}>
                  <Trash2 size={16} />
                  {t.permanentlyDelete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
