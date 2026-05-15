import { useEffect, useRef } from "react";

export type ContextMenuItem =
  | {
      label: string;
      icon?: React.ReactNode;
      onClick: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { divider: true };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部 / ESC 关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 延迟 1 帧再绑定，避免点击触发本菜单的同一个 mousedown 立刻触发关闭
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // 防止超出视口右 / 下边缘
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (rect.right > vw) nx = Math.max(8, vw - rect.width - 8);
    if (rect.bottom > vh) ny = Math.max(8, vh - rect.height - 8);
    if (nx !== x || ny !== y) {
      menuRef.current.style.left = `${nx}px`;
      menuRef.current.style.top = `${ny}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if ("divider" in item) {
          return <div key={i} className="context-menu-divider" />;
        }
        return (
          <button
            key={i}
            className={
              "context-menu-item" + (item.danger ? " danger" : "") + (item.disabled ? " disabled" : "")
            }
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
