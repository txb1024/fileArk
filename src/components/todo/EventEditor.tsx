import { Bell, Check, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Todo, TodoColor } from "../../types";
import { Modal } from "../Modal";
import { COLOR_LABEL_EN, COLOR_LABEL_ZH, TODO_COLORS } from "./colors";
import { fromISO, toLocalISO, withMinutesOfDay } from "./dateUtils";

type Mode = "create" | "edit";

/** 时段预设:用户在三个固定时段间选,或选自定义后手动输入 */
export type Period = "morning" | "afternoon" | "evening" | "custom";

export const PERIOD_RANGES: Record<Exclude<Period, "custom">, { startMin: number; endMin: number }> = {
  morning: { startMin: 9 * 60, endMin: 12 * 60 }, // 9:00 - 12:00
  afternoon: { startMin: 14 * 60, endMin: 18 * 60 }, // 14:00 - 18:00
  evening: { startMin: 19 * 60, endMin: 21 * 60 }, // 19:00 - 21:00
};

/** 根据现有 start/end 判断是哪个预设(精确命中)或自定义 */
function detectPeriod(start: Date, end: Date): Period {
  const sm = start.getHours() * 60 + start.getMinutes();
  const em = end.getHours() * 60 + end.getMinutes();
  for (const [key, range] of Object.entries(PERIOD_RANGES) as [Exclude<Period, "custom">, typeof PERIOD_RANGES.morning][]) {
    if (sm === range.startMin && em === range.endMin) return key;
  }
  return "custom";
}

/** 提醒选项 — value 单位:分钟。-1 = 不提醒 */
export const REMIND_OPTIONS: { value: number; labelZh: string; labelEn: string }[] = [
  { value: -1, labelZh: "不提醒", labelEn: "None" },
  { value: 0, labelZh: "准时", labelEn: "At time" },
  { value: 5, labelZh: "提前 5 分钟", labelEn: "5 min before" },
  { value: 15, labelZh: "提前 15 分钟", labelEn: "15 min before" },
  { value: 30, labelZh: "提前 30 分钟", labelEn: "30 min before" },
  { value: 60, labelZh: "提前 1 小时", labelEn: "1 hour before" },
];

type Props = {
  mode: Mode;
  initial: {
    id?: string;
    title?: string;
    notes?: string;
    start: Date;
    end: Date;
    color?: TodoColor;
    done?: boolean;
    remindOffsetMin?: number;
  };
  lang: "zh" | "en";
  onClose: () => void;
  onSave: (payload: {
    title: string;
    notes: string;
    start: Date;
    end: Date;
    color: TodoColor;
    done?: boolean;
    remindOffsetMin: number;
  }) => void;
  onDelete?: () => void;
};

function toDtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDtLocal(v: string): Date {
  return new Date(v);
}

export function EventEditor({ mode, initial, lang, onClose, onSave, onDelete }: Props) {
  const tt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const colorLabel = lang === "zh" ? COLOR_LABEL_ZH : COLOR_LABEL_EN;

  const [title, setTitle] = useState(initial.title ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [color, setColor] = useState<TodoColor>(initial.color ?? "sky");
  const [done, setDone] = useState(initial.done ?? false);
  const [remindOffset, setRemindOffset] = useState<number>(initial.remindOffsetMin ?? -1);

  const initialPeriod = detectPeriod(initial.start, initial.end);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [startStr, setStartStr] = useState(toDtLocal(initial.start));
  const [endStr, setEndStr] = useState(toDtLocal(initial.end));

  // 切换到预设时段时自动改 start/end(保留 anchor 日期)。
  // 切换到 custom 时不动当前 start/end,让用户在原值基础上编辑。
  useEffect(() => {
    if (period === "custom") return;
    const base = fromDtLocal(startStr);
    const range = PERIOD_RANGES[period];
    const newStart = withMinutesOfDay(base, range.startMin);
    const newEnd = withMinutesOfDay(base, range.endMin);
    setStartStr(toDtLocal(newStart));
    setEndStr(toDtLocal(newEnd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function handleSave() {
    const s = fromDtLocal(startStr);
    let e = fromDtLocal(endStr);
    if (e <= s) {
      e = new Date(s.getTime() + 30 * 60 * 1000);
    }
    onSave({
      title: title.trim() || tt("(无标题)", "(Untitled)"),
      notes: notes.trim(),
      start: s,
      end: e,
      color,
      done: mode === "edit" ? done : undefined,
      remindOffsetMin: remindOffset,
    });
  }

  const PERIODS: { id: Period; labelZh: string; labelEn: string; hint?: string }[] = [
    { id: "morning", labelZh: "上午", labelEn: "Morning", hint: "9:00 - 12:00" },
    { id: "afternoon", labelZh: "下午", labelEn: "Afternoon", hint: "14:00 - 18:00" },
    { id: "evening", labelZh: "晚上", labelEn: "Evening", hint: "19:00 - 21:00" },
    { id: "custom", labelZh: "自定义", labelEn: "Custom", hint: tt("手动选时间", "Pick times") },
  ];

  const isCustom = period === "custom";

  return (
    <Modal
      title={mode === "create" ? tt("新建事件", "New Event") : tt("编辑事件", "Edit Event")}
      onClose={onClose}
    >
      <div className="cal-editor">
        <input
          className="cal-editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={tt("标题", "Title")}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") onClose();
          }}
        />

        <div className="cal-editor-field">
          <span>{tt("时段", "Period")}</span>
          <div className="cal-period-row">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={period === p.id ? "cal-period-btn active" : "cal-period-btn"}
                onClick={() => setPeriod(p.id)}
              >
                <span className="cal-period-label">
                  {lang === "zh" ? p.labelZh : p.labelEn}
                </span>
                {p.hint && <span className="cal-period-hint">{p.hint}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className={isCustom ? "cal-editor-row is-custom" : "cal-editor-row"}>
          <label className="cal-editor-field">
            <span>{tt("开始", "Start")}</span>
            <input
              type="datetime-local"
              value={startStr}
              disabled={!isCustom}
              onChange={(e) => setStartStr(e.target.value)}
            />
          </label>
          <label className="cal-editor-field">
            <span>{tt("结束", "End")}</span>
            <input
              type="datetime-local"
              value={endStr}
              disabled={!isCustom}
              onChange={(e) => setEndStr(e.target.value)}
            />
          </label>
        </div>

        <div className="cal-editor-field">
          <span>
            <Bell size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
            {tt("提醒", "Reminder")}
          </span>
          <select
            className="cal-editor-select"
            value={remindOffset}
            onChange={(e) => setRemindOffset(Number(e.target.value))}
          >
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {lang === "zh" ? o.labelZh : o.labelEn}
              </option>
            ))}
          </select>
        </div>

        <div className="cal-editor-field">
          <span>{tt("颜色", "Color")}</span>
          <div className="cal-color-row">
            {TODO_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={[
                  "cal-color-chip",
                  `todo-color-${c}`,
                  c === color ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setColor(c)}
                title={colorLabel[c]}
                aria-label={colorLabel[c]}
              />
            ))}
          </div>
        </div>

        <label className="cal-editor-field">
          <span>{tt("备注", "Notes")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={tt("可选", "Optional")}
          />
        </label>

        {mode === "edit" && (
          <button
            type="button"
            className={done ? "cal-done-toggle is-done" : "cal-done-toggle"}
            onClick={() => setDone((v) => !v)}
            aria-pressed={done}
          >
            <span className="cal-done-toggle-icon">
              {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </span>
            <span className="cal-done-toggle-label">
              {done ? tt("已完成", "Completed") : tt("标记为已完成", "Mark as completed")}
            </span>
            {done && (
              <span className="cal-done-toggle-badge">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        )}

        <div className="cal-editor-footer">
          {mode === "edit" && onDelete && (
            <button className="danger" onClick={onDelete}>
              <Trash2 size={14} />
              {tt("删除", "Delete")}
            </button>
          )}
          <div className="cal-editor-footer-right">
            <button className="secondary" onClick={onClose}>
              {tt("取消", "Cancel")}
            </button>
            <button className="primary" onClick={handleSave}>
              {tt("保存", "Save")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** 把 Todo 转给 EventEditor 用的 initial */
export function todoToInitial(todo: Todo): Props["initial"] {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes,
    start: fromISO(todo.start),
    end: fromISO(todo.end),
    color: todo.color,
    done: todo.done,
    remindOffsetMin: todo.remindOffsetMin,
  };
}

export { toLocalISO };
