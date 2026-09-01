/**
 * 待办事项汇报生成器
 *
 * 把指定时间范围内的 todos 渲染成 BlockNote 文档 JSON,
 * 写入便签 (.bnote) 即可。结构:
 *   H1  标题(日报/周报/月报 — 时间范围)
 *   p   汇总统计行
 *   ── 日视图: 已完成 / 未完成 分组 ──
 *   ── 周/月视图: 按日分组,每日 (完成数/总数) ──
 *   - 每条待办用 checkListItem,checked = todo.done
 */
import type { Todo } from "../../types";
import {
  addDays,
  endOfDay,
  fmtHM,
  fromISO,
  startOfDay,
  startOfWeek,
} from "./dateUtils";

export type ReportScope = "day" | "week" | "month";

type Lang = "zh" | "en";

type Styles = Record<string, boolean>;

interface InlineText {
  type: "text";
  text: string;
  styles: Styles;
}

interface Block {
  type: string;
  props?: Record<string, unknown>;
  content?: InlineText[];
}

function txt(text: string, styles: Styles = {}): InlineText {
  return { type: "text", text, styles };
}

function heading(level: 1 | 2 | 3, text: string): Block {
  return { type: "heading", props: { level }, content: [txt(text)] };
}

function paragraph(text = ""): Block {
  return { type: "paragraph", content: text ? [txt(text)] : [] };
}

function check(text: string, checked: boolean): Block {
  return { type: "checkListItem", props: { checked }, content: [txt(text)] };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function rangeOf(scope: ReportScope, anchor: Date): { start: Date; end: Date } {
  if (scope === "day") {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  if (scope === "week") {
    const start = startOfWeek(anchor); // 周一 00:00
    return { start, end: endOfDay(addDays(start, 6)) };
  }
  // month: 当月 1 号 00:00 → 月末 23:59:59.999
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

function overlapsRange(
  todo: Todo,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  const ts = fromISO(todo.start).getTime();
  const te = fromISO(todo.end).getTime();
  return ts <= rangeEnd && te >= rangeStart;
}

function titleOf(todo: Todo, lang: Lang): string {
  return todo.title.trim() || (lang === "zh" ? "(无标题)" : "(Untitled)");
}

function chipLine(todo: Todo, lang: Lang): string {
  const s = fmtHM(fromISO(todo.start));
  const e = fmtHM(fromISO(todo.end));
  return `${s}–${e}  ${titleOf(todo, lang)}`;
}

function weekdayChip(d: Date, lang: Lang): string {
  const zh = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const en = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (lang === "zh" ? zh : en)[d.getDay()];
}

export interface BuildReportResult {
  /** 便签文件名(不含扩展名) */
  noteName: string;
  /** BlockNote 文档(JSON 字符串) */
  content: string;
  /** 父文件夹相对路径,会自动创建 */
  parent: string;
}

export function buildReport(
  scope: ReportScope,
  anchor: Date,
  todos: Todo[],
  lang: Lang,
): BuildReportResult {
  const { start, end } = rangeOf(scope, anchor);
  const rangeStart = start.getTime();
  const rangeEnd = end.getTime();

  const ranged = todos
    .filter((t) => overlapsRange(t, rangeStart, rangeEnd))
    .sort((a, b) => a.start.localeCompare(b.start));

  const total = ranged.length;
  const done = ranged.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // ── 标题 + 文件名 ──
  let titleText: string;
  let noteName: string;
  if (scope === "day") {
    const ds = fmtDate(start);
    titleText = lang === "zh" ? `日报 — ${ds}` : `Daily Report — ${ds}`;
    noteName = lang === "zh" ? `日报 ${ds}` : `Daily ${ds}`;
  } else if (scope === "week") {
    const ws = fmtDate(start);
    const we = fmtDate(addDays(start, 6));
    titleText =
      lang === "zh" ? `周报 — ${ws} ~ ${we}` : `Weekly Report — ${ws} ~ ${we}`;
    noteName = lang === "zh" ? `周报 ${ws}` : `Weekly ${ws}`;
  } else {
    const y = start.getFullYear();
    const m = start.getMonth() + 1;
    titleText =
      lang === "zh"
        ? `月报 — ${y} 年 ${m} 月`
        : `Monthly Report — ${y}/${pad2(m)}`;
    noteName = lang === "zh" ? `月报 ${y}-${pad2(m)}` : `Monthly ${y}-${pad2(m)}`;
  }

  const parent = lang === "zh" ? "汇报" : "Reports";

  const blocks: Block[] = [];
  blocks.push(heading(1, titleText));

  // ── 汇总 ──
  const summary =
    lang === "zh"
      ? `共 ${total} 项,完成 ${done} 项 (${pct}%)。`
      : `${total} items, ${done} completed (${pct}%).`;
  blocks.push(paragraph(summary));
  blocks.push(paragraph(""));

  if (total === 0) {
    blocks.push(
      paragraph(lang === "zh" ? "本期间无待办事项。" : "No todos in this period."),
    );
    return { noteName, content: JSON.stringify(blocks), parent };
  }

  if (scope === "day") {
    // 单日: 已完成 / 未完成 分组
    const completed = ranged.filter((t) => t.done);
    const pending = ranged.filter((t) => !t.done);

    if (completed.length > 0) {
      blocks.push(
        heading(
          2,
          lang === "zh"
            ? `已完成 (${completed.length})`
            : `Completed (${completed.length})`,
        ),
      );
      for (const t of completed) {
        blocks.push(check(chipLine(t, lang), true));
      }
    }
    if (pending.length > 0) {
      blocks.push(
        heading(
          2,
          lang === "zh" ? `未完成 (${pending.length})` : `Pending (${pending.length})`,
        ),
      );
      for (const t of pending) {
        blocks.push(check(chipLine(t, lang), false));
      }
    }
  } else {
    // 周/月: 按日分组
    const dayCount =
      scope === "week"
        ? 7
        : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();

    for (let i = 0; i < dayCount; i++) {
      const day =
        scope === "week"
          ? addDays(start, i)
          : new Date(start.getFullYear(), start.getMonth(), i + 1);
      const ds = startOfDay(day).getTime();
      const de = endOfDay(day).getTime();
      const dayTodos = ranged
        .filter((t) => overlapsRange(t, ds, de))
        .sort((a, b) => a.start.localeCompare(b.start));
      if (dayTodos.length === 0) continue;

      const dayDone = dayTodos.filter((t) => t.done).length;
      const wk = weekdayChip(day, lang);
      const dateLabel = fmtDate(day);
      const head =
        lang === "zh"
          ? `${dateLabel} ${wk} (${dayDone}/${dayTodos.length})`
          : `${dateLabel} ${wk} (${dayDone}/${dayTodos.length})`;
      blocks.push(heading(2, head));
      for (const t of dayTodos) {
        blocks.push(check(chipLine(t, lang), t.done));
      }
    }
  }

  return { noteName, content: JSON.stringify(blocks), parent };
}
