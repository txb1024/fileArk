import { Modal } from "../components";
import type { Messages } from "../types";

interface MigrateRootDialogProps {
  oldRoot: string;
  newRoot: string;
  fileCount: number;
  t: Messages;
  onConfirm: (migrate: boolean) => void;
  onClose: () => void;
}

export function MigrateRootDialog({ oldRoot, newRoot, fileCount, t, onConfirm, onClose }: MigrateRootDialogProps) {
  return (
    <Modal title={t.migrateTitle} onClose={onClose}>
      <p>{t.migrateBody.replace("{count}", String(fileCount))}</p>
      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        {oldRoot} → {newRoot}
      </p>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          {t.migrateCancel}
        </button>
        <button className="secondary" onClick={() => onConfirm(false)}>
          {t.migrateSkip}
        </button>
        <button className="primary danger" onClick={() => onConfirm(true)}>
          {t.migrateConfirm}
        </button>
      </div>
    </Modal>
  );
}
