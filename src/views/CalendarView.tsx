import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Todo, TodoColor } from "../types";
import { CalendarToolbar, type CalendarMode } from "../components/todo/CalendarToolbar";
import { DayView } from "../components/todo/DayView";
import { WeekView } from "../components/todo/WeekView";
import { MonthView } from "../components/todo/MonthView";
import { EventEditor, todoToInitial, toLocalISO } from "../components/todo/EventEditor";
import { pickAutoColor } from "../components/todo/colors";
import { buildReport, type ReportScope } from "../components/todo/reportGenerator";
import {
  addDays,
  addMonths,
  fmtHM,
  fromISO,
  isSameDay,
  startOfDay,
  withMinutesOfDay,
} from "../components/todo/dateUtils";

type Props = {
  language: "zh" | "en";
  /** workspace 切换时父级传入新 key,触发重新加载 */
  workspaceKey?: string;
};

type EditorState =
  | { kind: "create"; start: Date; end: Date }
  | { kind: "edit"; todo: Todo }
  | null;

export function CalendarView({ language, workspaceKey }: Props) {
  const lang = language;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [editor, setEditor] = useState<EditorState>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.listTodos();
      setTodos(list);
    } catch (err) {
      console.error("listTodos failed", err);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, workspaceKey]);

  // ── 提醒轮询 ────────────────────────────────────────
  // 每 30 秒扫一次未完成且未提醒的 todo,到达 (start - remindOffset) 时弹通知。
  // 用本地 Set 兜底,避免轮询并发触发同一条;后端 reminded 字段确保跨会话不重弹。
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    function check() {
      const now = Date.now();
      todos.forEach((t) => {
        if (t.done || t.reminded) return;
        if (t.remindOffsetMin < 0) return;
        if (firedRef.current.has(t.id)) return;
        const triggerAt = fromISO(t.start).getTime() - t.remindOffsetMin * 60_000;
        // 仅在「到点了」且「还没过 start 太久(避免补提醒已结束的事件)」时触发
        if (now < triggerAt) return;
        if (now > fromISO(t.start).getTime() + 5 * 60_000) {
          // 已开始超过 5 分钟还未提醒(罕见),静默标记 reminded 跳过
          firedRef.current.add(t.id);
          api.updateTodo(t.id, { reminded: true }).catch(() => {});
          return;
        }
        firedRef.current.add(t.id);
        const startDate = fromISO(t.start);
        const offsetLabel =
          t.remindOffsetMin === 0
            ? language === "zh"
              ? "现在开始"
              : "starting now"
            : language === "zh"
              ? `${t.remindOffsetMin} 分钟后开始 (${fmtHM(startDate)})`
              : `starts in ${t.remindOffsetMin} min (${fmtHM(startDate)})`;
        api
          .sendNotification(t.title || (language === "zh" ? "待办提醒" : "Reminder"), offsetLabel)
          .catch((err) => console.error("sendNotification failed", err));
        api
          .updateTodo(t.id, { reminded: true })
          .then((next) => {
            setTodos((arr) => arr.map((x) => (x.id === next.id ? next : x)));
          })
          .catch((err) => console.error("mark reminded failed", err));
      });
    }
    // 首次立即检查一次,再每 30s 一次
    check();
    const handle = window.setInterval(check, 30_000);
    return () => window.clearInterval(handle);
  }, [todos, language]);

  // todos 变更时清空 firedRef 中已经被后端标记 reminded 的 id(让 set 不会无限增长)
  useEffect(() => {
    const valid = new Set(
      todos
        .filter((t) => !t.done && !t.reminded && t.remindOffsetMin >= 0)
        .map((t) => t.id),
    );
    for (const id of firedRef.current) {
      if (!valid.has(id)) firedRef.current.delete(id);
    }
  }, [todos]);

  const onPrev = useCallback(() => {
    if (mode === "day") setAnchor((d) => addDays(d, -1));
    else if (mode === "week") setAnchor((d) => addDays(d, -7));
    else setAnchor((d) => addMonths(d, -1));
  }, [mode]);

  const onNext = useCallback(() => {
    if (mode === "day") setAnchor((d) => addDays(d, 1));
    else if (mode === "week") setAnchor((d) => addDays(d, 7));
    else setAnchor((d) => addMonths(d, 1));
  }, [mode]);

  const onToday = useCallback(() => setAnchor(new Date()), []);

  // 快捷键:T 今天 / M W D / ← →。编辑器打开 / 输入框聚焦时不响应。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (editor) return;
      const key = e.key.toLowerCase();
      if (key === "t") {
        e.preventDefault();
        onToday();
      } else if (key === "m") {
        e.preventDefault();
        setMode("month");
      } else if (key === "w") {
        e.preventDefault();
        setMode("week");
      } else if (key === "d") {
        e.preventDefault();
        setMode("day");
      } else if (key === "arrowleft" && !e.altKey) {
        e.preventDefault();
        onPrev();
      } else if (key === "arrowright" && !e.altKey) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, onPrev, onNext, onToday]);

  const onCreate = useCallback((start: Date, end: Date) => {
    setEditor({ kind: "create", start, end });
  }, []);

  const onEdit = useCallback((todo: Todo) => {
    setEditor({ kind: "edit", todo });
  }, []);

  const onNewClicked = useCallback(() => {
    const today = new Date();
    const base = startOfDay(anchor);
    let start: Date;
    if (isSameDay(base, today)) {
      const h = Math.min(today.getHours() + 1, 22);
      start = withMinutesOfDay(base, h * 60);
    } else {
      start = withMinutesOfDay(base, 9 * 60);
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEditor({ kind: "create", start, end });
  }, [anchor]);

  const onToggleDone = useCallback(
    async (todo: Todo) => {
      try {
        const next = await api.toggleTodoDone(todo.id);
        setTodos((arr) => arr.map((t) => (t.id === next.id ? next : t)));
      } catch (err) {
        console.error("toggleTodoDone failed", err);
        reload();
      }
    },
    [reload],
  );

  const onMoved = useCallback(
    async (todo: Todo, newStart: Date, newEnd: Date) => {
      try {
        const next = await api.updateTodo(todo.id, {
          start: toLocalISO(newStart),
          end: toLocalISO(newEnd),
        });
        setTodos((arr) => arr.map((t) => (t.id === next.id ? next : t)));
      } catch (err) {
        console.error("updateTodo failed", err);
        reload();
      }
    },
    [reload],
  );

  const onDrillDown = useCallback((day: Date) => {
    setAnchor(day);
    setMode("day");
  }, []);

  // ── 生成日报 / 周报 / 月报 ─────────────────────────────
  // 当前视图模式 → 报告范围。生成 BlockNote JSON,自动建 "汇报/" 文件夹下的便签。
  // 文件名冲突时后端会自动追加 "(1)" 等,不会覆盖既有报告。
  const reportBusyRef = useRef(false);
  const onGenerateReport = useCallback(async () => {
    if (reportBusyRef.current) return;
    reportBusyRef.current = true;
    try {
      const scope: ReportScope = mode;
      const { noteName, content, parent } = buildReport(scope, anchor, todos, lang);
      const meta = await api.createNote({ parent, name: noteName });
      await api.saveNote(meta.id, content);
      const titleZh =
        scope === "day" ? "日报已生成" : scope === "week" ? "周报已生成" : "月报已生成";
      const titleEn =
        scope === "day"
          ? "Daily report created"
          : scope === "week"
            ? "Weekly report created"
            : "Monthly report created";
      const bodyZh = `已写入便签:${parent}/${meta.name}`;
      const bodyEn = `Saved to note: ${parent}/${meta.name}`;
      try {
        await api.sendNotification(
          lang === "zh" ? titleZh : titleEn,
          lang === "zh" ? bodyZh : bodyEn,
        );
      } catch (err) {
        console.warn("sendNotification failed", err);
      }
    } catch (err) {
      console.error("generate report failed", err);
      try {
        await api.sendNotification(
          lang === "zh" ? "生成报告失败" : "Report generation failed",
          String(err),
        );
      } catch {
        /* ignore */
      }
    } finally {
      reportBusyRef.current = false;
    }
  }, [mode, anchor, todos, lang]);

  // create 模式给个稳定自动色 + 默认不提醒
  const createInitial = useMemo(() => {
    if (editor?.kind !== "create") return null;
    const color: TodoColor = pickAutoColor(String(editor.start.getTime()));
    return {
      start: editor.start,
      end: editor.end,
      color,
      remindOffsetMin: -1,
    };
  }, [editor]);

  const view = (() => {
    if (mode === "day") {
      return (
        <DayView
          anchor={anchor}
          todos={todos}
          lang={lang}
          onCreate={onCreate}
          onEdit={onEdit}
          onToggleDone={onToggleDone}
          onMoved={onMoved}
        />
      );
    }
    if (mode === "week") {
      return (
        <WeekView
          anchor={anchor}
          todos={todos}
          lang={lang}
          onCreate={onCreate}
          onEdit={onEdit}
          onToggleDone={onToggleDone}
          onMoved={onMoved}
        />
      );
    }
    return (
      <MonthView
        anchor={anchor}
        todos={todos}
        lang={lang}
        onCreate={onCreate}
        onEdit={onEdit}
        onToggleDone={onToggleDone}
        onDrillDown={onDrillDown}
      />
    );
  })();

  return (
    <div className="cal-view">
      <CalendarToolbar
        mode={mode}
        anchor={anchor}
        lang={lang}
        onModeChange={setMode}
        onNew={onNewClicked}
        onToday={onToday}
        onPrev={onPrev}
        onNext={onNext}
        onGenerateReport={onGenerateReport}
      />
      {view}
      {editor && (
        <EventEditor
          mode={editor.kind}
          initial={
            editor.kind === "edit" ? todoToInitial(editor.todo) : createInitial!
          }
          lang={lang}
          onClose={() => setEditor(null)}
          onSave={async (payload) => {
            try {
              if (editor.kind === "create") {
                const created = await api.createTodo({
                  title: payload.title,
                  notes: payload.notes,
                  start: toLocalISO(payload.start),
                  end: toLocalISO(payload.end),
                  color: payload.color,
                  remindOffsetMin: payload.remindOffsetMin,
                });
                setTodos((arr) => [...arr, created]);
              } else {
                const updated = await api.updateTodo(editor.todo.id, {
                  title: payload.title,
                  notes: payload.notes,
                  start: toLocalISO(payload.start),
                  end: toLocalISO(payload.end),
                  color: payload.color,
                  done: payload.done,
                  remindOffsetMin: payload.remindOffsetMin,
                });
                setTodos((arr) => arr.map((t) => (t.id === updated.id ? updated : t)));
              }
            } catch (err) {
              console.error("save todo failed", err);
            } finally {
              setEditor(null);
            }
          }}
          onDelete={
            editor.kind === "edit"
              ? async () => {
                  try {
                    await api.deleteTodo(editor.todo.id);
                    setTodos((arr) => arr.filter((t) => t.id !== editor.todo.id));
                  } catch (err) {
                    console.error("deleteTodo failed", err);
                  } finally {
                    setEditor(null);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
