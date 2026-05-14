import { Modal } from "../components";

interface ConfirmDangerDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDangerDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose
}: ConfirmDangerDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          {cancelLabel}
        </button>
        <button className="primary danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
