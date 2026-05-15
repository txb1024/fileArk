import { Eye, Monitor } from "lucide-react";
import { useState } from "react";
import { CodePreview } from "./CodePreview";

export function HtmlPreview({ content }: { content: string }) {
  const [viewMode, setViewMode] = useState<"render" | "source">("render");

  return (
    <div className="preview-html-container">
      <div className="html-toolbar">
        <button
          className={`compact-button ${viewMode === "render" ? "primary" : "secondary"}`}
          onClick={() => setViewMode("render")}
        >
          <Eye size={13} /> 渲染
        </button>
        <button
          className={`compact-button ${viewMode === "source" ? "primary" : "secondary"}`}
          onClick={() => setViewMode("source")}
        >
          <Monitor size={13} /> 源码
        </button>
      </div>
      {viewMode === "render" ? (
        <div className="html-render-wrapper">
          <iframe
            className="html-render-iframe"
            srcDoc={content}
            title="HTML Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <CodePreview content={content} ext="html" />
      )}
    </div>
  );
}
