import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import hljs from "highlight.js";
import "katex/dist/katex.min.css";
import { List } from "lucide-react";

interface TocItem {
  level: number;
  text: string;
  id: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-龥\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function buildToc(content: string): TocItem[] {
  const lines = content.split("\n");
  const items: TocItem[] = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      items.push({ level, text, id: slugify(text) });
    }
  }
  return items;
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(({ default: mermaid }) => {
        if (cancelled) return;
        mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
        mermaid
          .render(idRef.current, code)
          .then(({ svg }) => {
            if (!cancelled && ref.current) ref.current.innerHTML = svg;
          })
          .catch((e) => {
            if (!cancelled) setError(String(e));
          });
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-error">
        <p>Mermaid 渲染失败</p>
        <pre>{code}</pre>
      </div>
    );
  }
  return <div ref={ref} className="mermaid-block" />;
}

export function MarkdownPreview({ content }: { content: string }) {
  const toc = useMemo(() => buildToc(content), [content]);
  const [showToc, setShowToc] = useState(true);

  return (
    <div className={`preview-markdown-layout ${showToc && toc.length > 2 ? "with-toc" : ""}`}>
      <div className="preview-markdown-container">
        {toc.length > 2 && (
          <button
            className="markdown-toc-toggle compact-button secondary"
            onClick={() => setShowToc((v) => !v)}
            title={showToc ? "隐藏目录" : "显示目录"}
          >
            <List size={13} />
            目录
          </button>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: ({ children }) => <h1 id={slugify(String(children))}>{children}</h1>,
            h2: ({ children }) => <h2 id={slugify(String(children))}>{children}</h2>,
            h3: ({ children }) => <h3 id={slugify(String(children))}>{children}</h3>,
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const codeStr = String(children).replace(/\n$/, "");
              const lang = match?.[1];
              if (lang === "mermaid") {
                return <MermaidBlock code={codeStr} />;
              }
              if (lang && hljs.getLanguage(lang)) {
                const html = hljs.highlight(codeStr, { language: lang }).value;
                return (
                  <pre>
                    <code className={className} dangerouslySetInnerHTML={{ __html: html }} {...props} />
                  </pre>
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {showToc && toc.length > 2 && (
        <aside className="markdown-toc">
          <div className="markdown-toc-title">目录</div>
          <ul>
            {toc.map((it, i) => (
              <li key={i} className={`toc-level-${it.level}`} style={{ paddingLeft: (it.level - 1) * 12 }}>
                <a href={`#${it.id}`}>{it.text}</a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
