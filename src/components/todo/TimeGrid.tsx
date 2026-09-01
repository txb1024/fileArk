/**
 * 左侧时间标签栏 + 网格水平分割线。
 * 简单线性渲染 0-23 点(共 24 行)。
 */
import {
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  minutesToY,
} from "./dateUtils";

type Props = {
  lang: "zh" | "en";
};

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeGrid({ lang }: Props) {
  const isZh = lang === "zh";
  return (
    <div className="cal-time-axis" style={{ height: `${TOTAL_HEIGHT}px` }} aria-hidden>
      {ALL_HOURS.map((h) => {
        const top = minutesToY(h * 60);
        const isNoon = h === 12;
        return (
          <div key={h} className="cal-time-tick" style={{ top: `${top}px` }}>
            <span className="cal-time-label">
              {isNoon
                ? isZh
                  ? "正午"
                  : "Noon"
                : `${String(h).padStart(2, "0")}:00`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 整列水平线背景层 */
export function HourLines() {
  return (
    <div
      className="cal-hour-lines"
      style={{ height: `${TOTAL_HEIGHT}px` }}
      aria-hidden
    >
      {ALL_HOURS.slice(1).map((h) => {
        const top = minutesToY(h * 60);
        return <div key={h} className="cal-hour-line" style={{ top: `${top}px` }} />;
      })}
    </div>
  );
}

export { HOUR_HEIGHT, TOTAL_HEIGHT };
