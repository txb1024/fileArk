/**
 * 日历视图通用日期工具。
 * 全部使用本地时区(避免出现"今天显示成昨天"的常见 bug)。
 * 周起始固定为周一(用户在方案选择中确认)。
 */

/** 每小时高度(px) — 与 styles.css 同步 */
export const HOUR_HEIGHT = 48;
/** 鼠标拖动 / 边缘缩放的时间吸附粒度(分钟) */
export const SNAP_MINUTES = 15;
/** 整列总高 = 24 小时 × HOUR_HEIGHT */
export const TOTAL_HEIGHT = 24 * HOUR_HEIGHT;
/** 视图初始滚动到的小时(用户期望进入界面看到 7 点) */
export const INITIAL_SCROLL_HOUR = 7;

/** 把 Date 转为后端要求的 RFC3339(以本地时间视角拼装,避免 UTC 时差混淆)。 */
export function toLocalISO(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const tzh = pad(Math.floor(Math.abs(tz) / 60));
  const tzm = pad(Math.abs(tz) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${tzh}:${tzm}`
  );
}

/** 把后端返回的 RFC3339 解析回 Date(JS Date 本就支持) */
export function fromISO(s: string): Date {
  return new Date(s);
}

/** 同日判定(忽略时间) */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 加天数(不可变) */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 月份偏移(保持日,日期超过新月时回退到月末) */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

/** 当日 00:00 */
export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** 当日 23:59:59.999 */
export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

/** 该周的周一 00:00(周一为首) */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const dow = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - dow);
  return r;
}

/** 该月所在的「月视图首日」:覆盖当月 1 号的那周的周一 */
export function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}

/** 把分钟吸附到 SNAP_MINUTES 网格 */
export function snapMinutes(mins: number): number {
  return Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
}

/** 「自当日 00:00 起的分钟数」→ 整列 Y 坐标(px)。线性映射,无折叠。 */
export function minutesToY(mins: number): number {
  const m = Math.max(0, Math.min(24 * 60, mins));
  return (m / 60) * HOUR_HEIGHT;
}

/** Y 坐标(px)→ 自当日 00:00 起的分钟数,并吸附到 SNAP_MINUTES。 */
export function yToMinutes(y: number): number {
  const yc = Math.max(0, Math.min(TOTAL_HEIGHT, y));
  const mins = (yc / HOUR_HEIGHT) * 60;
  return Math.max(0, Math.min(24 * 60, snapMinutes(mins)));
}

/** 一个 Date 对应当日的「自 00:00 起的分钟数」 */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** 把分钟数转为当日的 Date */
export function withMinutesOfDay(base: Date, mins: number): Date {
  const r = startOfDay(base);
  r.setMinutes(mins);
  return r;
}

/** 格式化为 "HH:mm" */
export function fmtHM(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 周一为首的周内索引(0..6) */
export function dayOfWeekMonFirst(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** 中英文「周X」/「Mon..Sun」 */
export function weekdayShort(idx: number, lang: "zh" | "en"): string {
  const zh = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const en = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (lang === "zh" ? zh : en)[idx];
}

/** 月份名 */
export function monthName(d: Date, lang: "zh" | "en"): string {
  if (lang === "zh") return `${d.getMonth() + 1}月`;
  const en = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return en[d.getMonth()];
}

/** 两个时间区间是否重叠(用于事件块重叠检测) */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
