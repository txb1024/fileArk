import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  headerExtra?: ReactNode;
}

export function Modal({ title, onClose, children, style, headerExtra }: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={style}>
        <div className="modal-header">
          <h2>{title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {headerExtra}
            <button className="icon-button" onClick={onClose} aria-label="关闭">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
