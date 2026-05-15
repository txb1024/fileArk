import { useMemo } from "react";
import { CodePreview } from "./CodePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { base64ToText } from "./utils";

interface IpynbCell {
  cell_type: "markdown" | "code" | "raw";
  source: string | string[];
  outputs?: IpynbOutput[];
  execution_count?: number | null;
}

interface IpynbOutput {
  output_type: "stream" | "execute_result" | "display_data" | "error";
  text?: string | string[];
  name?: string;
  data?: Record<string, string | string[]>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

interface Notebook {
  cells: IpynbCell[];
  metadata?: {
    kernelspec?: { language?: string; display_name?: string };
    language_info?: { name?: string };
  };
}

const flatten = (s: string | string[] | undefined): string => {
  if (!s) return "";
  return Array.isArray(s) ? s.join("") : s;
};

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

function OutputBlock({ output }: { output: IpynbOutput }) {
  if (output.output_type === "stream") {
    return (
      <pre className={`ipynb-stream ${output.name === "stderr" ? "stderr" : ""}`}>
        {flatten(output.text)}
      </pre>
    );
  }
  if (output.output_type === "error") {
    return (
      <pre className="ipynb-error">
        {output.ename}: {output.evalue}
        {"\n"}
        {(output.traceback || []).map(stripAnsi).join("\n")}
      </pre>
    );
  }
  // execute_result / display_data
  const data = output.data || {};
  if (data["image/png"]) {
    const src = `data:image/png;base64,${flatten(data["image/png"])}`;
    return <img className="ipynb-image" src={src} alt="output" />;
  }
  if (data["image/jpeg"]) {
    const src = `data:image/jpeg;base64,${flatten(data["image/jpeg"])}`;
    return <img className="ipynb-image" src={src} alt="output" />;
  }
  if (data["image/svg+xml"]) {
    return (
      <div className="ipynb-svg" dangerouslySetInnerHTML={{ __html: flatten(data["image/svg+xml"]) }} />
    );
  }
  if (data["text/html"]) {
    return (
      <div className="ipynb-html" dangerouslySetInnerHTML={{ __html: flatten(data["text/html"]) }} />
    );
  }
  if (data["text/plain"]) {
    return <pre className="ipynb-text-output">{flatten(data["text/plain"])}</pre>;
  }
  return null;
}

export function IpynbPreview({ base64 }: { base64: string }) {
  const { cells, language, error } = useMemo(() => {
    try {
      const text = base64ToText(base64);
      const nb = JSON.parse(text) as Notebook;
      const lang =
        nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name || "python";
      return { cells: nb.cells || [], language: lang, error: null };
    } catch (e) {
      return { cells: [], language: "python", error: String(e) };
    }
  }, [base64]);

  if (error) {
    return (
      <div className="preview-error">
        <p>Notebook 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }

  return (
    <div className="preview-ipynb-container">
      <div className="ipynb-meta">共 {cells.length} 个单元 · 内核 {language}</div>
      {cells.map((cell, i) => {
        const src = flatten(cell.source);
        if (cell.cell_type === "markdown") {
          return (
            <div key={i} className="ipynb-cell ipynb-markdown-cell">
              <MarkdownPreview content={src} />
            </div>
          );
        }
        if (cell.cell_type === "code") {
          return (
            <div key={i} className="ipynb-cell ipynb-code-cell">
              <div className="ipynb-cell-prompt">In [{cell.execution_count ?? " "}]:</div>
              <CodePreview content={src} ext={language} showToolbar={false} />
              {cell.outputs && cell.outputs.length > 0 && (
                <div className="ipynb-outputs">
                  {cell.outputs.map((out, j) => (
                    <OutputBlock key={j} output={out} />
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={i} className="ipynb-cell ipynb-raw-cell">
            <pre>{src}</pre>
          </div>
        );
      })}
    </div>
  );
}
