import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, BookOpen, Type } from "lucide-react";
import { base64ToUint8Array } from "./utils";

interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

type EpubBook = {
  destroy: () => void;
  loaded: { navigation: Promise<{ toc: TocItem[] }> };
  renderTo: (
    el: HTMLElement,
    options: { width: string | number; height: string | number; spread?: string; flow?: string }
  ) => EpubRendition;
};
type EpubRendition = {
  display: (target?: string) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  themes: {
    fontSize: (size: string) => void;
    register: (name: string, css: Record<string, Record<string, string>>) => void;
    select: (name: string) => void;
  };
  on: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function EpubPreview({ base64, themeMode }: { base64: string; themeMode?: string }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bytes = base64ToUint8Array(base64);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    import("epubjs")
      .then(({ default: ePub }) => {
        if (cancelled) return;
        try {
          const book = ePub(buffer as ArrayBuffer) as unknown as EpubBook;
          bookRef.current = book;
          if (!viewerRef.current) return;
          const rendition = book.renderTo(viewerRef.current, {
            width: "100%",
            height: "100%",
            spread: "none",
            flow: "paginated",
          });
          renditionRef.current = rendition;

          // 主题
          rendition.themes.register("dark", {
            body: { color: "#e6edf3", background: "#0d1117" },
            a: { color: "#58a6ff" },
          });
          rendition.themes.register("light", {
            body: { color: "#1f2328", background: "#ffffff" },
          });
          rendition.themes.select(themeMode === "dark" ? "dark" : "light");

          rendition.display().catch(() => {});

          book.loaded.navigation.then((nav) => {
            if (!cancelled) setToc(nav.toc || []);
          });
        } catch (e) {
          setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));

    return () => {
      cancelled = true;
      if (bookRef.current) bookRef.current.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [base64, themeMode]);

  // 字号变化
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  const next = () => renditionRef.current?.next();
  const prev = () => renditionRef.current?.prev();

  // 键盘翻页
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const goTo = (href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  };

  if (error) {
    return (
      <div className="preview-error">
        <p>EPUB 加载失败</p>
        <small>{error}</small>
      </div>
    );
  }

  return (
    <div className="preview-epub-container">
      <div className="epub-toolbar">
        <button
          className={`compact-button ${showToc ? "primary" : "secondary"}`}
          onClick={() => setShowToc((v) => !v)}
          disabled={toc.length === 0}
        >
          <BookOpen size={13} /> 目录
        </button>
        <div className="epub-toolbar-spacer" />
        <button
          className="compact-button secondary"
          onClick={() => setFontSize((s) => Math.max(70, s - 10))}
          title="缩小字号"
        >
          <Type size={11} />–
        </button>
        <span className="zoom-label">{fontSize}%</span>
        <button
          className="compact-button secondary"
          onClick={() => setFontSize((s) => Math.min(180, s + 10))}
          title="放大字号"
        >
          <Type size={15} />+
        </button>
      </div>
      <div className="epub-body">
        {showToc && toc.length > 0 && (
          <aside className="epub-toc-panel">
            <ul>
              {toc.map((item, i) => (
                <li key={i}>
                  <button onClick={() => goTo(item.href)}>{item.label.trim()}</button>
                  {item.subitems && item.subitems.length > 0 && (
                    <ul>
                      {item.subitems.map((sub, j) => (
                        <li key={j}>
                          <button onClick={() => goTo(sub.href)}>{sub.label.trim()}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}
        <div className="epub-viewer-wrapper">
          <button className="epub-nav epub-nav-prev" onClick={prev} title="上一页 (←)">
            <ChevronLeft size={20} />
          </button>
          <div ref={viewerRef} className="epub-viewer" />
          <button className="epub-nav epub-nav-next" onClick={next} title="下一页 (→)">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
