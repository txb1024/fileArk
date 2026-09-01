import { Check } from "lucide-react";
import type { Todo } from "../../types";
import { fmtHM, fromISO } from "./dateUtils";

type Props = {
  todo: Todo;
  /** 视觉布局参数 */
  topPx: number;
  heightPx: number;
  /** 在重叠分栏中的位置(0..columnCount-1) */
  columnIndex: number;
  columnCount: number;
  /** 拖动/缩放过程中临时显示的时间区间(若未提供则取 todo.start/end) */
  displayStart?: Date;
  displayEnd?: Date;
  onClick?: () => void;
  onToggleDone?: () => void;
  /** 拖动开始(整体移动) — 由父组件传入鼠标事件处理器 */
  onMoveStart?: (e: React.MouseEvent) => void;
  /** 上/下边缘缩放 */
  onResizeStart?: (e: React.MouseEvent, edge: "top" | "bottom") => void;
  /** 是否是"草稿态"(拖动创建过程中) */
  draft?: boolean;
};

export function EventBlock({
  todo,
  topPx,
  heightPx,
  columnIndex,
  columnCount,
  displayStart,
  displayEnd,
  onClick,
  onToggleDone,
  onMoveStart,
  onResizeStart,
  draft,
}: Props) {
  const start = displayStart ?? fromISO(todo.start);
  const end = displayEnd ?? fromISO(todo.end);
  const widthPct = 100 / columnCount;
  const leftPct = columnIndex * widthPct;

  // 短事件(<35min)只显示一行
  const compact = heightPx < 36;

  return (
    <div
      className={[
        "cal-event",
        `todo-color-${todo.color}`,
        todo.done ? "is-done" : "",
        draft ? "is-draft" : "",
        compact ? "is-compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        top: `${topPx}px`,
        height: `${Math.max(heightPx, 18)}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      onMouseDown={onMoveStart}
      onClick={(e) => {
        // 防止 onMoveStart 触发后又冒泡触发 onClick
        if (e.defaultPrevented) return;
        onClick?.();
      }}
      role="button"
      tabIndex={0}
    >
      {!draft && (
        <button
          className="cal-event-check"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone?.();
          }}
          aria-label={todo.done ? "标记未完成" : "标记完成"}
        >
          {todo.done ? <Check size={11} strokeWidth={3} /> : null}
        </button>
      )}
      <div className="cal-event-body">
        <div className="cal-event-title">{todo.title || "(无标题)"}</div>
        {!compact && (
          <div className="cal-event-time">
            {fmtHM(start)} - {fmtHM(end)}
          </div>
        )}
      </div>
      {!draft && onResizeStart && (
        <>
          <div
            className="cal-event-resize cal-event-resize-top"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, "top");
            }}
          />
          <div
            className="cal-event-resize cal-event-resize-bottom"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, "bottom");
            }}
          />
        </>
      )}
    </div>
  );
}
