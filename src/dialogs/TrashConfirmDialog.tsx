import { Modal } from "../components";
import type { Messages } from "../types";

interface TrashConfirmDialogProps {
  t: Messages;
  onConfirm: () => void;
  onClose: () => void;
}

export function TrashConfirmDialog({ t, onConfirm, onClose }: TrashConfirmDialogProps) {
  return (
    <Modal title={t.emptyTrash} onClose={onClose}>
      <p>{t.emptyTrashConfirm}</p>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          {t.migrateCancel}
        </button>
        <button className="primary danger" onClick={onConfirm}>
          {t.emptyTrash}
        </button>
      </div>
    </Modal>
  );
}
