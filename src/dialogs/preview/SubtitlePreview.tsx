import { useMemo, useState } from "react";
import { base64ToText } from "./utils";

interface Cue {
  start: string;
  end: string;
  text: string;
}

function parseSrtVtt(text: string): Cue[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const cues: Cue[] = [];
  const re = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/;
  for (const blk of blocks) {
    const lines = blk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    let timeLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        timeLine = i;
        break;
      }
    }
    if (timeLine === -1) continue;
    const m = lines[timeLine].match(re);
    if (!m) continue;
    const text = lines.slice(timeLine + 1).join("\n");
    if (text.trim()) cues.push({ start: m[1], end: m[2], text });
  }
  return cues;
}

function parseAss(text: string): Cue[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cues: Cue[] = [];
  let formatFields: string[] | null = null;
  let textIdx = -1;
  let startIdx = -1;
  let endIdx = -1;
  for (const line of lines) {
    if (line.startsWith("Format:") && line.toLowerCase().includes("text")) {
      formatFields = line.replace(/^Format:\s*/, "").split(",").map((s) => s.trim());
      textIdx = formatFields.findIndex((f) => f.toLowerCase() === "text");
      startIdx = formatFields.findIndex((f) => f.toLowerCase() === "start");
      endIdx = formatFields.findIndex((f) => f.toLowerCase() === "end");
    } else if (line.startsWith("Dialogue:") && formatFields && textIdx >= 0) {
      const body = line.replace(/^Dialogue:\s*/, "");
      const parts = body.split(",");
      // 文字部分可能含逗号，合并末尾
      const text = parts.slice(textIdx).join(",").replace(/\\N/g, "\n").replace(/\{[^}]*\}/g, "");
      const start = startIdx >= 0 ? parts[startIdx] : "";
      const end = endIdx >= 0 ? parts[endIdx] : "";
      if (text.trim()) cues.push({ start, end, text });
    }
  }
  return cues;
}

export function SubtitlePreview({ base64, ext }: { base64: string; ext: string }) {
  const [filter, setFilter] = useState("");
  const cues = useMemo(() => {
    const text = base64ToText(base64);
    if (ext === "ass" || ext === "ssa") return parseAss(text);
    return parseSrtVtt(text);
  }, [base64, ext]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return cues;
    const q = filter.toLowerCase();
    return cues.filter((c) => c.text.toLowerCase().includes(q));
  }, [cues, filter]);

  return (
    <div className="preview-subtitle-container">
      <div className="subtitle-toolbar">
        <input
          type="text"
          className="subtitle-search"
          placeholder="搜索对白..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="subtitle-meta">
          {filtered.length} / {cues.length} 条
        </span>
      </div>
      <div className="subtitle-list">
        {filtered.length === 0 ? (
          <div className="subtitle-empty">未找到对白</div>
        ) : (
          filtered.map((c, i) => (
            <div key={i} className="subtitle-line">
              <div className="subtitle-time">
                <span className="subtitle-time-start">{c.start}</span>
                <span className="subtitle-time-arrow">→</span>
                <span className="subtitle-time-end">{c.end}</span>
              </div>
              <div className="subtitle-text">
                {c.text.split("\n").map((t, j) => (
                  <div key={j}>{t}</div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
