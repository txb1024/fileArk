/**
 * 单天的时间柱:含事件块渲染 + 拖动创建 + 拖动移动/缩放。
 * 父组件(WeekView / DayView)负责把当天的事件过滤好传进来。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Todo } from "../../types";
import { EventBlock } from "./EventBlock";
import {
  HOUR_HEIGHT,
  SNAP_MINUTES,
  TOTAL_HEIGHT,
  fmtHM,
  fromISO,
  isSameDay,
  minutesOfDay,
  minutesToY,
  startOfDay,
  withMinutesOfDay,
  yToMinutes,
} from "./dateUtils";

type Props = {
  date: Date;
  todos: Todo[];
  /** 是否是当日 */
  isToday: boolean;
  /** 是否是周末 */
  isWeekend: boolean;
  onCreate: (start: Date, end: Date) => void;
  onEdit: (todo: Todo) => void;
  onToggleDone: (todo: Todo) => void;
  /** 把 todo 拖动到的新时间区间(可能跨日)写回 */
  onMoved: (todo: Todo, newStart: Date, newEnd: Date) => void;
};

type LaidOut = { todo: Todo; col: number; cols: number };

/** 同一天内重叠事件并排布局(贪心算法) */
function layoutDay(date: Date, events: Todo[]): LaidOut[] {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  // 把跨日事件截断到当日
  const clipped = events
    .map((e) => {
      const s = Math.max(fromISO(e.start).getTime(), dayStart);
      const ee = Math.min(fromISO(e.end).getTime(), dayEnd);
      return { todo: e, s, e: ee };
    })
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);

  const result: LaidOut[] = [];
  let group: typeof clipped = [];
  let groupEnd = -Infinity;

  function flush() {
    if (group.length === 0) return;
    // 贪心:每列记录当前的 end,新事件挑第一个空闲列
    const colEnds: number[] = [];
    const assigned: { todo: Todo; col: number }[] = [];
    for (const item of group) {
      let col = colEnds.findIndex((end) => end <= item.s);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = item.e;
      assigned.push({ todo: item.todo, col });
    }
    const cols = colEnds.length;
    for (const a of assigned) result.push({ ...a, cols });
    group = [];
    groupEnd = -Infinity;
  }

  for (const item of clipped) {
    if (item.s >= groupEnd) {
      flush();
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.e);
  }
  flush();

  return result;
}

type Drag =
  | { kind: "create"; startY: number; endY: number }
  | {
      kind: "move";
      todoId: string;
      startY: number;
      currentY: number;
      origStart: Date;
      origEnd: Date;
    }
  | {
      kind: "resize";
      todoId: string;
      edge: "top" | "bottom";
      startY: number;
      currentY: number;
      origStart: Date;
      origEnd: Date;
    }
  | null;

export function DayColumn({
  date,
  todos,
  isToday,
  isWeekend,
  onCreate,
  onEdit,
  onToggleDone,
  onMoved,
}: Props) {
  const colRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  dragRef.current = drag;

  const laidOut = layoutDay(date, todos);

  /** 把 clientY 转成相对网格顶部的 px */
  const getRelativeY = useCallback((clientY: number) => {
    const rect = colRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(TOTAL_HEIGHT, clientY - rect.top));
  }, []);

  /**
   * 计算「拖动后的新时间」— 用绝对 Y 位置而不是 delta 算,以确保结果自然吸附到 15 分钟。
   * 返回的 mins 是相对当日 00:00 的分钟数(可能 < 0 或 > 1440,由 caller 处理跨日)。
   */
  function snappedMinutesFromDrag(origDate: Date, startClientY: number, currentClientY: number): number {
    const origRelY = minutesToY(minutesOfDay(origDate));
    const newRelY = origRelY + (currentClientY - startClientY);
    // 允许越界一点点,然后再吸附 — 越界时按 SNAP 边界回卷
    if (newRelY < 0) {
      // 越过当日顶部 → 视作前一日的负分钟数(让 caller 卷到前一日)
      const minsBelow = Math.round((-newRelY / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
      return -minsBelow;
    }
    if (newRelY > TOTAL_HEIGHT) {
      const minsAbove = Math.round(((newRelY - TOTAL_HEIGHT) / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
      return 24 * 60 + minsAbove;
    }
    return yToMinutes(newRelY);
  }

  /** 把分钟数(可能越界)转成绝对 Date,以当日 base 为基准跨日累加。 */
  function dateFromMinutes(base: Date, mins: number): Date {
    const d = startOfDay(base);
    d.setMinutes(mins);
    return d;
  }

  // 空白处按下 → 开始拖动创建
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // 只在直接点击 column 时启动 create(不响应事件块上的冒泡 — 事件块会 stopPropagation)
    if ((e.target as HTMLElement).closest(".cal-event")) return;
    const y = getRelativeY(e.clientY);
    setDrag({ kind: "create", startY: y, endY: y });
  };

  // 事件块拖动 (移动)
  const startMove = useCallback(
    (todo: Todo) => (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setDrag({
        kind: "move",
        todoId: todo.id,
        startY: e.clientY,
        currentY: e.clientY,
        origStart: fromISO(todo.start),
        origEnd: fromISO(todo.end),
      });
    },
    [],
  );

  // 事件块边缘缩放
  const startResize = useCallback(
    (todo: Todo) => (e: React.MouseEvent, edge: "top" | "bottom") => {
      if (e.button !== 0) return;
      e.preventDefault();
      setDrag({
        kind: "resize",
        todoId: todo.id,
        edge,
        startY: e.clientY,
        currentY: e.clientY,
        origStart: fromISO(todo.start),
        origEnd: fromISO(todo.end),
      });
    },
    [],
  );

  // 监听 window 上的 mousemove/mouseup
  useEffect(() => {
    if (!drag) return;
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === "create") {
        setDrag({ ...d, endY: getRelativeY(e.clientY) });
      } else if (d.kind === "move" || d.kind === "resize") {
        setDrag({ ...d, currentY: e.clientY });
      }
    }
    function onUp() {
      const d = dragRef.current;
      if (!d) {
        setDrag(null);
        return;
      }
      // 拖动 move / resize 后,浏览器随后会发一个 click 事件 →
      // 冒泡到 EventBlock 的 onClick → 触发 onEdit → 弹窗,这是用户报告的 bug。
      // 在 capture 阶段挂一次性拦截器,把紧随的那次 click 吞掉。
      function swallowNextClick() {
        const blocker = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener("click", blocker, true);
        };
        window.addEventListener("click", blocker, true);
        // 兜底:如果 click 没触发(鼠标已离开页面等),50ms 后自动清理,避免误吞下一次正常点击
        window.setTimeout(() => {
          window.removeEventListener("click", blocker, true);
        }, 50);
      }

      if (d.kind === "create") {
        const minA = yToMinutes(d.startY);
        const minB = yToMinutes(d.endY);
        let s = Math.min(minA, minB);
        let e = Math.max(minA, minB);
        if (e - s < 15) e = s + 30; // 单击/微小拖动默认 30 分钟
        const start = withMinutesOfDay(date, s);
        const end = withMinutesOfDay(date, e);
        setDrag(null);
        onCreate(start, end);
      } else if (d.kind === "move") {
        const moved = Math.abs(d.currentY - d.startY) > 2;
        const newStartMin = snappedMinutesFromDrag(d.origStart, d.startY, d.currentY);
        const dur =
          (d.origEnd.getTime() - d.origStart.getTime()) / 60000;
        const newStart = dateFromMinutes(date, newStartMin);
        const newEnd = new Date(newStart.getTime() + dur * 60000);
        const todo = todos.find((t) => t.id === d.todoId);
        const timeChanged =
          newStart.getTime() !== d.origStart.getTime() ||
          newEnd.getTime() !== d.origEnd.getTime();
        if (todo && timeChanged) {
          onMoved(todo, newStart, newEnd);
        }
        setDrag(null);
        if (moved) swallowNextClick();
      } else if (d.kind === "resize") {
        const moved = Math.abs(d.currentY - d.startY) > 2;
        let newStart = d.origStart;
        let newEnd = d.origEnd;
        if (d.edge === "top") {
          const newStartMin = snappedMinutesFromDrag(d.origStart, d.startY, d.currentY);
          newStart = dateFromMinutes(date, newStartMin);
          if (newStart >= newEnd) {
            newStart = new Date(newEnd.getTime() - SNAP_MINUTES * 60000);
          }
        } else {
          const newEndMin = snappedMinutesFromDrag(d.origEnd, d.startY, d.currentY);
          newEnd = dateFromMinutes(date, newEndMin);
          if (newEnd <= newStart) {
            newEnd = new Date(newStart.getTime() + SNAP_MINUTES * 60000);
          }
        }
        const todo = todos.find((t) => t.id === d.todoId);
        const timeChanged =
          newStart.getTime() !== d.origStart.getTime() ||
          newEnd.getTime() !== d.origEnd.getTime();
        if (todo && timeChanged) {
          onMoved(todo, newStart, newEnd);
        }
        setDrag(null);
        // resize 即使位移很小,只要不是 0 也算"用户在调时间",不应弹窗
        if (moved || timeChanged) swallowNextClick();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [drag, date, todos, onCreate, onMoved, getRelativeY]);

  // 渲染拖动中的临时块(create 模式)
  let draftNode: React.ReactNode = null;
  if (drag?.kind === "create") {
    const y1 = Math.min(drag.startY, drag.endY);
    const y2 = Math.max(drag.startY, drag.endY);
    const minutesA = yToMinutes(y1);
    const minutesB = yToMinutes(y2);
    const topPx = minutesToY(minutesA);
    const heightPx = Math.max(minutesToY(minutesB) - topPx, 18);
    const startLabel = withMinutesOfDay(date, minutesA);
    const endLabel = withMinutesOfDay(date, Math.max(minutesB, minutesA + 30));
    draftNode = (
      <div
        className="cal-event is-draft todo-color-sky"
        style={{
          top: `${topPx}px`,
          height: `${heightPx}px`,
          left: "2px",
          right: "2px",
          width: "auto",
        }}
      >
        <div className="cal-event-body">
          <div className="cal-event-title">(新建事件)</div>
          <div className="cal-event-time">
            {fmtHM(startLabel)} - {fmtHM(endLabel)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={colRef}
      className={[
        "cal-day-col",
        isWeekend ? "is-weekend" : "",
        isToday ? "is-today" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height: `${TOTAL_HEIGHT}px` }}
      onMouseDown={handleMouseDown}
    >
      {laidOut.map(({ todo, col, cols }) => {
        // 截断到当日范围
        const dayStartMs = startOfDay(date).getTime();
        const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
        const ts = Math.max(fromISO(todo.start).getTime(), dayStartMs);
        const te = Math.min(fromISO(todo.end).getTime(), dayEndMs);
        const baseStartMin = (ts - dayStartMs) / 60000;
        const baseEndMin = (te - dayStartMs) / 60000;

        // 当前块正在被拖动 → 用吸附后的预览时间渲染,让时间标签实时更新
        let displayStart = fromISO(todo.start);
        let displayEnd = fromISO(todo.end);
        let topPx = minutesToY(baseStartMin);
        let heightPx = minutesToY(baseEndMin) - topPx;

        if (drag?.kind === "move" && drag.todoId === todo.id) {
          const newStartMin = snappedMinutesFromDrag(drag.origStart, drag.startY, drag.currentY);
          const dur =
            (drag.origEnd.getTime() - drag.origStart.getTime()) / 60000;
          displayStart = dateFromMinutes(date, newStartMin);
          displayEnd = new Date(displayStart.getTime() + dur * 60000);
          // 重新计算位置(仍以当日为基准)
          const ds = (displayStart.getTime() - dayStartMs) / 60000;
          const de = (displayEnd.getTime() - dayStartMs) / 60000;
          topPx = minutesToY(Math.max(0, Math.min(24 * 60, ds)));
          heightPx = minutesToY(Math.max(0, Math.min(24 * 60, de))) - topPx;
        } else if (drag?.kind === "resize" && drag.todoId === todo.id) {
          if (drag.edge === "top") {
            const newStartMin = snappedMinutesFromDrag(drag.origStart, drag.startY, drag.currentY);
            displayStart = dateFromMinutes(date, newStartMin);
            if (displayStart >= displayEnd) {
              displayStart = new Date(displayEnd.getTime() - SNAP_MINUTES * 60000);
            }
          } else {
            const newEndMin = snappedMinutesFromDrag(drag.origEnd, drag.startY, drag.currentY);
            displayEnd = dateFromMinutes(date, newEndMin);
            if (displayEnd <= displayStart) {
              displayEnd = new Date(displayStart.getTime() + SNAP_MINUTES * 60000);
            }
          }
          const ds = (displayStart.getTime() - dayStartMs) / 60000;
          const de = (displayEnd.getTime() - dayStartMs) / 60000;
          topPx = minutesToY(Math.max(0, Math.min(24 * 60, ds)));
          heightPx = minutesToY(Math.max(0, Math.min(24 * 60, de))) - topPx;
        }

        return (
          <EventBlock
            key={todo.id}
            todo={todo}
            displayStart={displayStart}
            displayEnd={displayEnd}
            topPx={topPx}
            heightPx={Math.max(heightPx, 18)}
            columnIndex={col}
            columnCount={cols}
            onClick={() => onEdit(todo)}
            onToggleDone={() => onToggleDone(todo)}
            onMoveStart={startMove(todo)}
            onResizeStart={startResize(todo)}
          />
        );
      })}
      {draftNode}
      {isToday && <NowIndicator date={date} />}
    </div>
  );
}

/** 当前时间的红线指示(只在 isToday 时渲染) */
function NowIndicator({ date }: { date: Date }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!isSameDay(now, date)) return null;
  const top = minutesToY(minutesOfDay(now));
  return <div className="cal-now-line" style={{ top: `${top}px` }} />;
}
