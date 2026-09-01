import { useEffect, useMemo, useRef } from "react";
import type { Todo } from "../../types";
import { DayColumn } from "./DayColumn";
import { HourLines, TimeGrid } from "./TimeGrid";
import {
  INITIAL_SCROLL_HOUR,
  addDays,
  dayOfWeekMonFirst,
  endOfDay,
  fromISO,
  isSameDay,
  minutesToY,
  startOfDay,
  startOfWeek,
  weekdayShort,
} from "./dateUtils";

type Props = {
  anchor: Date;
  todos: Todo[];
  lang: "zh" | "en";
  onCreate: (start: Date, end: Date) => void;
  onEdit: (todo: Todo) => void;
  onToggleDone: (todo: Todo) => void;
  onMoved: (todo: Todo, newStart: Date, newEnd: Date) => void;
};

export function WeekView({
  anchor,
  todos,
  lang,
  onCreate,
  onEdit,
  onToggleDone,
  onMoved,
}: Props) {
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [anchor]);

  const todosByDay = useMemo(() => {
    return days.map((d) => {
      const dayStart = startOfDay(d).getTime();
      const dayEnd = endOfDay(d).getTime();
      return todos.filter((t) => {
        const ts = fromISO(t.start).getTime();
        const te = fromISO(t.end).getTime();
        return ts <= dayEnd && te >= dayStart;
      });
    });
  }, [days, todos]);

  // 初始挂载时把视图滚动到 INITIAL_SCROLL_HOUR(默认 7 点)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = minutesToY(INITIAL_SCROLL_HOUR * 60);
  }, []);

  return (
    <div className="cal-week">
      {/* 滚动区:把表头也放进来,这样表头宽度自动避开滚动条,与下方网格列对齐 */}
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-week-header">
          <div className="cal-header-spacer" />
          {days.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div
                key={d.toISOString()}
                className={[
                  "cal-week-header-cell",
                  isToday ? "is-today" : "",
                  i >= 5 ? "is-weekend" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="cal-week-header-dow">
                  {weekdayShort(dayOfWeekMonFirst(d), lang)}
                </div>
                <div className={isToday ? "cal-week-header-date is-today" : "cal-week-header-date"}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        <div className="cal-week-grid">
          <TimeGrid lang={lang} />
          <div className="cal-week-cols">
            <HourLines />
            {days.map((d, i) => (
              <DayColumn
                key={d.toISOString()}
                date={d}
                todos={todosByDay[i]}
                isToday={isSameDay(d, today)}
                isWeekend={i >= 5}
                onCreate={onCreate}
                onEdit={onEdit}
                onToggleDone={onToggleDone}
                onMoved={onMoved}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
