import { useEffect, useMemo, useState } from "react";
import { base64ToUint8Array } from "./utils";

interface FontMeta {
  familyName: string;
  fullName: string;
  styleName: string;
  designer: string;
  copyright: string;
  glyphCount: number;
  unitsPerEm: number;
}

const SAMPLES = [
  { label: "拉丁字母", text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz" },
  { label: "数字符号", text: "0123456789\n!@#$%^&*()-_=+[]{}<>?/.," },
  { label: "经典示例", text: "The quick brown fox jumps over the lazy dog" },
  { label: "中文字符", text: "永和九年，岁在癸丑\n春江潮水连海平，海上明月共潮生" },
  { label: "段落示例", text: "汉字 ABC 123\n字体设计 Typography\n文档资料库 FileArk" },
];

export function FontPreview({ base64, ext, name }: { base64: string; ext: string; name: string }) {
  const [meta, setMeta] = useState<FontMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(36);
  const [customText, setCustomText] = useState("");

  // 注入 @font-face
  const fontFamily = useMemo(() => `preview-${Math.random().toString(36).slice(2, 9)}`, []);
  useEffect(() => {
    const mime: Record<string, string> = {
      ttf: "font/ttf",
      otf: "font/otf",
      woff: "font/woff",
      woff2: "font/woff2",
    };
    const m = mime[ext] || "application/octet-stream";
    const url = `data:${m};base64,${base64}`;
    const styleId = `font-style-${fontFamily}`;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@font-face { font-family: "${fontFamily}"; src: url(${url}) format("${ext}"); font-display: swap; }`;
    document.head.appendChild(style);
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, [base64, ext, fontFamily]);

  // 解析元数据
  useEffect(() => {
    let cancelled = false;
    import("opentype.js")
      .then(({ default: opentype }) => {
        if (cancelled) return;
        try {
          const bytes = base64ToUint8Array(base64);
          const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const font = opentype.parse(buf as ArrayBuffer);
          const get = (k: string): string => {
            const v = font.names?.[k];
            if (!v) return "";
            return v.en || Object.values(v)[0] || "";
          };
          setMeta({
            familyName: get("fontFamily") || name,
            fullName: get("fullName") || name,
            styleName: get("fontSubfamily") || "Regular",
            designer: get("designer"),
            copyright: get("copyright"),
            glyphCount: font.glyphs?.length ?? 0,
            unitsPerEm: font.unitsPerEm ?? 0,
          });
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64, name]);

  return (
    <div className="preview-font-container">
      {meta && (
        <div className="font-meta">
          <h3 className="font-meta-name" style={{ fontFamily }}>
            {meta.fullName}
          </h3>
          <div className="font-meta-row">
            <span>{meta.familyName} · {meta.styleName}</span>
            <span>{meta.glyphCount} 个字形 · {meta.unitsPerEm} units/em</span>
          </div>
          {meta.designer && <div className="font-meta-line">设计：{meta.designer}</div>}
          {meta.copyright && <div className="font-meta-line">版权：{meta.copyright}</div>}
        </div>
      )}
      {error && (
        <div className="font-meta-error">
          字体元数据解析失败（不影响下方预览渲染）：{error}
        </div>
      )}

      <div className="font-toolbar">
        <input
          type="range"
          min={12}
          max={120}
          value={size}
          onChange={(e) => setSize(parseInt(e.target.value, 10))}
          className="font-size-slider"
        />
        <span className="font-size-label">{size}px</span>
      </div>

      <input
        type="text"
        className="font-custom-input"
        placeholder="输入自定义文字预览..."
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
      />
      {customText && (
        <div className="font-sample-block" style={{ fontFamily, fontSize: size }}>
          {customText}
        </div>
      )}

      {SAMPLES.map((s) => (
        <div key={s.label} className="font-sample-section">
          <div className="font-sample-label">{s.label}</div>
          <div className="font-sample-block" style={{ fontFamily, fontSize: size }}>
            {s.text.split("\n").map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
