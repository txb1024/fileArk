import { useEffect, useMemo, useRef } from "react";
import type { Todo } from "../../types";
import { DayColumn } from "./DayColumn";
import { HourLines, TimeGrid } from "./TimeGrid";
import {
  INITIAL_SCROLL_HOUR,
  dayOfWeekMonFirst,
  endOfDay,
  fromISO,
  isSameDay,
  minutesToY,
  startOfDay,
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

export function DayView({
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
  const dayTodos = useMemo(() => {
    const dayStart = startOfDay(anchor).getTime();
    const dayEnd = endOfDay(anchor).getTime();
    return todos.filter((t) => {
      const ts = fromISO(t.start).getTime();
      const te = fromISO(t.end).getTime();
      return ts <= dayEnd && te >= dayStart;
    });
  }, [anchor, todos]);

  const isToday = isSameDay(anchor, today);
  const dow = dayOfWeekMonFirst(anchor);
  const isWeekend = dow >= 5;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = minutesToY(INITIAL_SCROLL_HOUR * 60);
  }, []);

  return (
    <div className="cal-day">
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-day-header">
          <div className="cal-header-spacer" />
          <div
            className={[
              "cal-week-header-cell",
              isToday ? "is-today" : "",
              isWeekend ? "is-weekend" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="cal-week-header-dow">{weekdayShort(dow, lang)}</div>
            <div className={isToday ? "cal-week-header-date is-today" : "cal-week-header-date"}>
              {anchor.getDate()}
            </div>
          </div>
        </div>
        <div className="cal-week-grid">
          <TimeGrid lang={lang} />
          <div className="cal-week-cols cal-day-cols">
            <HourLines />
            <DayColumn
              date={anchor}
              todos={dayTodos}
              isToday={isToday}
              isWeekend={isWeekend}
              onCreate={onCreate}
              onEdit={onEdit}
              onToggleDone={onToggleDone}
              onMoved={onMoved}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
