import type { TodoColor } from "../../types";

export const TODO_COLORS: TodoColor[] = [
  "rose",
  "amber",
  "lemon",
  "mint",
  "sky",
  "indigo",
  "violet",
  "slate",
];

/** 调色板 — 与 styles.css 中 .todo-color-* 一一对应。 */
export const COLOR_LABEL_ZH: Record<TodoColor, string> = {
  rose: "粉",
  amber: "橙",
  lemon: "黄",
  mint: "绿",
  sky: "蓝",
  indigo: "靛",
  violet: "紫",
  slate: "灰",
};

export const COLOR_LABEL_EN: Record<TodoColor, string> = {
  rose: "Rose",
  amber: "Amber",
  lemon: "Lemon",
  mint: "Mint",
  sky: "Sky",
  indigo: "Indigo",
  violet: "Violet",
  slate: "Slate",
};

/** 简单 hash → 把没有指定颜色的事件按标题分配一个稳定色,避免视觉杂乱 */
export function pickAutoColor(seed: string): TodoColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % TODO_COLORS.length;
  return TODO_COLORS[idx];
}
