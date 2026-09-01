/**
 * 月视图:6 行 × 7 列,每格列出当天事件 chip。
 * 不支持拖动创建(月视图密度太低,统一由日/周视图承担);点击格子打开新建编辑器。
 */
import { Check } from "lucide-react";
import { useMemo } from "react";
import type { Todo } from "../../types";
import {
  addDays,
  dayOfWeekMonFirst,
  endOfDay,
  fmtHM,
  fromISO,
  isSameDay,
  startOfDay,
  startOfMonthGrid,
  weekdayShort,
  withMinutesOfDay,
} from "./dateUtils";

type Props = {
  anchor: Date;
  todos: Todo[];
  lang: "zh" | "en";
  onCreate: (start: Date, end: Date) => void;
  onEdit: (todo: Todo) => void;
  onToggleDone: (todo: Todo) => void;
  /** 点击某一天的 "+N 更多" 跳到日视图 */
  onDrillDown?: (day: Date) => void;
};

const MAX_VISIBLE_PER_DAY = 4;

export function MonthView({
  anchor,
  todos,
  lang,
  onCreate,
  onEdit,
  onToggleDone,
  onDrillDown,
}: Props) {
  const today = new Date();
  const days = useMemo(() => {
    const s = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }, [anchor]);

  // 把每一天的事件提前算好
  const todosByDay = useMemo(() => {
    return days.map((d) => {
      const ds = startOfDay(d).getTime();
      const de = endOfDay(d).getTime();
      return todos
        .filter((t) => {
          const ts = fromISO(t.start).getTime();
          const te = fromISO(t.end).getTime();
          return ts <= de && te >= ds;
        })
        .sort((a, b) => a.start.localeCompare(b.start));
    });
  }, [days, todos]);

  const currentMonth = anchor.getMonth();

  return (
    <div className="cal-month">
      {/* 周X 表头 */}
      <div className="cal-month-header">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={["cal-month-dow", i >= 5 ? "is-weekend" : ""].filter(Boolean).join(" ")}
          >
            {weekdayShort(i, lang)}
          </div>
        ))}
      </div>

      <div className="cal-month-grid">
        {days.map((d, idx) => {
          const dayTodos = todosByDay[idx];
          const isToday = isSameDay(d, today);
          const isOtherMonth = d.getMonth() !== currentMonth;
          const isWeekend = dayOfWeekMonFirst(d) >= 5;
          const overflow = dayTodos.length - MAX_VISIBLE_PER_DAY;

          return (
            <div
              key={d.toISOString()}
              className={[
                "cal-month-cell",
                isToday ? "is-today" : "",
                isOtherMonth ? "is-other-month" : "",
                isWeekend ? "is-weekend" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={(e) => {
                // 点击格子的空白处 → 新建当天 09:00-10:00
                if ((e.target as HTMLElement).closest(".cal-month-event")) return;
                if ((e.target as HTMLElement).closest(".cal-month-more")) return;
                const start = withMinutesOfDay(d, 9 * 60);
                const end = withMinutesOfDay(d, 10 * 60);
                onCreate(start, end);
              }}
            >
              <div className="cal-month-cell-head">
                <span
                  className={
                    isToday ? "cal-month-cell-date is-today" : "cal-month-cell-date"
                  }
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="cal-month-cell-events">
                {dayTodos.slice(0, MAX_VISIBLE_PER_DAY).map((todo) => (
                  <div
                    key={todo.id}
                    className={[
                      "cal-month-event",
                      `todo-color-${todo.color}`,
                      todo.done ? "is-done" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(todo);
                    }}
                  >
                    <button
                      className="cal-month-event-check"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleDone(todo);
                      }}
                      aria-label={todo.done ? "未完成" : "完成"}
                    >
                      {todo.done ? <Check size={9} strokeWidth={3.5} /> : null}
                    </button>
                    <span className="cal-month-event-time">
                      {fmtHM(fromISO(todo.start))}
                    </span>
                    <span className="cal-month-event-title">{todo.title || "(无标题)"}</span>
                  </div>
                ))}
                {overflow > 0 && (
                  <button
                    className="cal-month-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDrillDown?.(d);
                    }}
                  >
                    +{overflow} {lang === "zh" ? "更多" : "more"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
