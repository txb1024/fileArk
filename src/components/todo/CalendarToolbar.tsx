import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import { monthName } from "./dateUtils";

export type CalendarMode = "month" | "week" | "day";

type Props = {
  mode: CalendarMode;
  anchor: Date;
  lang: "zh" | "en";
  onModeChange: (m: CalendarMode) => void;
  onNew: () => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** 根据当前 mode 生成对应的日报/周报/月报到便签 */
  onGenerateReport: () => void;
};

const MODES: { id: CalendarMode; labelZh: string; labelEn: string }[] = [
  { id: "month", labelZh: "月", labelEn: "Month" },
  { id: "week", labelZh: "周", labelEn: "Week" },
  { id: "day", labelZh: "日", labelEn: "Day" },
];

function reportLabel(mode: CalendarMode, lang: "zh" | "en"): string {
  if (lang === "zh") {
    return mode === "day" ? "日报" : mode === "week" ? "周报" : "月报";
  }
  return mode === "day" ? "Daily" : mode === "week" ? "Weekly" : "Monthly";
}

export function CalendarToolbar({
  mode,
  anchor,
  lang,
  onModeChange,
  onNew,
  onToday,
  onPrev,
  onNext,
  onGenerateReport,
}: Props) {
  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-title">
        {anchor.getFullYear()}
        {lang === "zh" ? "年 " : " "}
        {monthName(anchor, lang)}
      </div>
      <div className="cal-toolbar-actions">
        <button className="cal-toolbar-iconbtn" onClick={onNew} title={lang === "zh" ? "新建事件" : "New"}>
          <Plus size={16} />
        </button>
        <button
          className="cal-report-btn"
          onClick={onGenerateReport}
          title={
            lang === "zh"
              ? `汇总当前${reportLabel(mode, "zh")}到便签`
              : `Summarize current ${reportLabel(mode, "en").toLowerCase()} view to a note`
          }
        >
          <FileText size={14} />
          <span>
            {lang === "zh" ? `生成${reportLabel(mode, "zh")}` : `Generate ${reportLabel(mode, "en")}`}
          </span>
        </button>
        <div className="cal-mode-segment" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              className={mode === m.id ? "cal-mode-btn active" : "cal-mode-btn"}
              onClick={() => onModeChange(m.id)}
            >
              {lang === "zh" ? m.labelZh : m.labelEn}
            </button>
          ))}
        </div>
        <div className="cal-nav-group">
          <button className="cal-toolbar-iconbtn" onClick={onPrev} title={lang === "zh" ? "上一个" : "Previous"}>
            <ChevronLeft size={16} />
          </button>
          <button className="cal-today-btn" onClick={onToday}>
            {lang === "zh" ? "今天" : "Today"}
          </button>
          <button className="cal-toolbar-iconbtn" onClick={onNext} title={lang === "zh" ? "下一个" : "Next"}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
