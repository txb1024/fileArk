import { useMemo } from "react";
import { base64ToText } from "./utils";

interface RtfRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface RtfPara {
  runs: RtfRun[];
  alignment: "left" | "center" | "right" | "justify";
}

// 轻量级 RTF 解析：提取段落 + 基本样式（粗体/斜体/下划线/对齐）
function parseRtf(rtf: string): RtfPara[] {
  const paras: RtfPara[] = [];
  let currentRuns: RtfRun[] = [];
  let alignment: RtfPara["alignment"] = "left";

  // 样式栈（{} group 嵌套）
  const stack: { bold: boolean; italic: boolean; underline: boolean; ignore: boolean }[] = [
    { bold: false, italic: false, underline: false, ignore: false },
  ];
  let buffer = "";
  let skipDestination = false;
  let unicodeSkip = 1;

  const top = () => stack[stack.length - 1];

  const flushBuffer = () => {
    if (buffer) {
      const s = top();
      currentRuns.push({
        text: buffer,
        bold: s.bold,
        italic: s.italic,
        underline: s.underline,
      });
      buffer = "";
    }
  };

  const finalizePara = () => {
    flushBuffer();
    if (currentRuns.length > 0 || paras.length === 0) {
      paras.push({ runs: currentRuns, alignment });
    }
    currentRuns = [];
  };

  let i = 0;
  while (i < rtf.length) {
    const ch = rtf[i];

    if (ch === "\\") {
      // control word / control symbol
      const next = rtf[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        if (!skipDestination && !top().ignore) buffer += next;
        i += 2;
        continue;
      }
      if (next === "'") {
        // hex byte
        if (!skipDestination && !top().ignore) {
          const hex = rtf.slice(i + 2, i + 4);
          const code = parseInt(hex, 16);
          if (!isNaN(code)) buffer += String.fromCharCode(code);
        }
        i += 4;
        continue;
      }
      if (next === "*") {
        // \* 标记可忽略目标
        skipDestination = true;
        i += 2;
        continue;
      }
      if (next === "u") {
        // \uN unicode
        let j = i + 2;
        let sign = 1;
        if (rtf[j] === "-") {
          sign = -1;
          j++;
        }
        let numStr = "";
        while (j < rtf.length && /\d/.test(rtf[j])) {
          numStr += rtf[j];
          j++;
        }
        if (numStr) {
          const code = sign * parseInt(numStr, 10);
          if (!skipDestination && !top().ignore) {
            buffer += String.fromCharCode(code < 0 ? code + 65536 : code);
          }
          // 跳过 N 个跟随字节
          let skip = unicodeSkip;
          if (rtf[j] === " ") j++;
          while (skip > 0 && j < rtf.length) {
            if (rtf[j] === "\\") {
              if (rtf[j + 1] === "'") j += 4;
              else j += 2;
            } else {
              j++;
            }
            skip--;
          }
          i = j;
          continue;
        }
      }

      // 一般 control word
      let j = i + 1;
      let word = "";
      while (j < rtf.length && /[a-zA-Z]/.test(rtf[j])) {
        word += rtf[j];
        j++;
      }
      let param = "";
      let neg = false;
      if (rtf[j] === "-") {
        neg = true;
        j++;
      }
      while (j < rtf.length && /\d/.test(rtf[j])) {
        param += rtf[j];
        j++;
      }
      // 一个空格作为分隔
      if (rtf[j] === " ") j++;
      i = j;

      const numParam = param ? (neg ? -1 : 1) * parseInt(param, 10) : null;

      flushBuffer();
      switch (word) {
        case "par":
          finalizePara();
          break;
        case "line":
          buffer += "\n";
          break;
        case "tab":
          buffer += "\t";
          break;
        case "b":
          top().bold = numParam !== 0;
          break;
        case "i":
          top().italic = numParam !== 0;
          break;
        case "ul":
        case "ulw":
          top().underline = true;
          break;
        case "ulnone":
          top().underline = false;
          break;
        case "ql":
          alignment = "left";
          break;
        case "qc":
          alignment = "center";
          break;
        case "qr":
          alignment = "right";
          break;
        case "qj":
          alignment = "justify";
          break;
        case "uc":
          unicodeSkip = numParam ?? 1;
          break;
        case "fonttbl":
        case "colortbl":
        case "stylesheet":
        case "info":
        case "pict":
        case "object":
        case "header":
        case "footer":
        case "themedata":
          top().ignore = true;
          break;
      }
      continue;
    }

    if (ch === "{") {
      stack.push({ ...top() });
      i++;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      if (stack.length === 0) stack.push({ bold: false, italic: false, underline: false, ignore: false });
      skipDestination = false;
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      i++;
      continue;
    }

    if (!skipDestination && !top().ignore) buffer += ch;
    i++;
  }

  finalizePara();
  return paras.filter((p) => p.runs.length > 0);
}

export function RtfPreview({ base64 }: { base64: string }) {
  const paras = useMemo(() => {
    try {
      const text = base64ToText(base64);
      return parseRtf(text);
    } catch {
      return [];
    }
  }, [base64]);

  if (paras.length === 0) {
    return (
      <div className="preview-error">
        <p>RTF 解析失败或文档为空</p>
      </div>
    );
  }

  return (
    <div className="preview-rtf-container">
      <div className="rtf-page">
        {paras.map((p, i) => (
          <p key={i} style={{ textAlign: p.alignment }}>
            {p.runs.map((r, j) => {
              let node: React.ReactNode = r.text;
              if (r.bold) node = <strong>{node}</strong>;
              if (r.italic) node = <em>{node}</em>;
              if (r.underline) node = <u>{node}</u>;
              return <span key={j}>{node}</span>;
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
