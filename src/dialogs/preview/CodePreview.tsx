import { Copy, Check, WrapText, AlignLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import hljs from "highlight.js";
import { extToLang } from "./utils";

interface CodePreviewProps {
  content: string;
  ext: string;
  showToolbar?: boolean;
}

export function CodePreview({ content, ext, showToolbar = true }: CodePreviewProps) {
  const [highlighted, setHighlighted] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const lines = useMemo(() => content.split("\n"), [content]);

  useEffect(() => {
    const lang = extToLang(ext);
    try {
      let result: string;
      if (lang && hljs.getLanguage(lang)) {
        result = hljs.highlight(content, { language: lang }).value;
      } else {
        result = hljs.highlightAuto(content).value;
      }
      setHighlighted(result);
    } catch {
      setHighlighted("");
    }
  }, [content, ext]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默失败
    }
  };

  return (
    <div className="code-viewer-wrapper">
      {showToolbar && (
        <div className="code-toolbar">
          <span className="code-toolbar-meta">
            {lines.length} 行 · {(content.length / 1024).toFixed(1)} KB
          </span>
          <div className="code-toolbar-actions">
            <button
              className="compact-button secondary"
              onClick={() => setWrap((w) => !w)}
              title={wrap ? "取消换行" : "自动换行"}
            >
              {wrap ? <AlignLeft size={13} /> : <WrapText size={13} />}
              {wrap ? "不换行" : "换行"}
            </button>
            <button
              className="compact-button secondary"
              onClick={handleCopy}
              title="复制全部"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}
      <div className={`code-viewer ${wrap ? "wrap" : ""}`}>
        <div className="code-line-numbers">
          {lines.map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <pre className="preview-text code-highlight">
          <code dangerouslySetInnerHTML={{ __html: highlighted || content }} />
        </pre>
      </div>
    </div>
  );
}
