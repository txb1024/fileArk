import { useEffect, useState } from "react";
import { base64ToUint8Array } from "./utils";

export function WordPreview({ base64, themeMode }: { base64: string; themeMode?: string }) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    import("mammoth")
      .then((mammoth) => {
        if (cancelled) return;
        try {
          const bytes = base64ToUint8Array(base64);
          const buf = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer;
          const options = {
            arrayBuffer: buf,
            convertImage: mammoth.images.imgElement((image: {
              read: (encoding: string) => Promise<string>;
              contentType: string;
            }) =>
              image.read("base64").then((data: string) => ({
                src: `data:${image.contentType};base64,${data}`,
              }))
            ),
          };
          mammoth.convertToHtml(options).then(
            (result: { value: string; messages: { type: string; message: string }[] }) => {
              if (cancelled) return;
              setHtml(result.value);
              const warns = result.messages
                .filter((m) => m.type === "warning")
                .map((m) => m.message)
                .slice(0, 3);
              setWarnings(warns);
            },
            (err: unknown) => {
              if (!cancelled) setError(String(err));
            }
          );
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64]);

  if (error) {
    return (
      <div className="preview-error">
        <p>Word 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (!html) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>解析中...</span>
      </div>
    );
  }
  return (
    <div className="preview-word-container">
      <div
        className={`word-page ${themeMode === "dark" ? "theme-dark" : ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {warnings.length > 0 && (
        <div className="word-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="word-warning-line">⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WordLegacyPreview({ name, onOpenExternal }: { name: string; onOpenExternal: () => void }) {
  return (
    <div className="preview-unsupported">
      <div className="unsupported-card">
        <h3 className="unsupported-file-name">{name}</h3>
        <p className="unsupported-hint">
          这是旧版 Word 二进制格式（.doc），在线预览仅支持 .docx。
          <br />
          请用 Word 打开后另存为 .docx，或直接用系统程序打开。
        </p>
        <button className="primary unsupported-action" onClick={onOpenExternal}>
          用系统程序打开
        </button>
      </div>
    </div>
  );
}
