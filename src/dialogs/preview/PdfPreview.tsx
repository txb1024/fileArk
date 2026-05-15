import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

// PDF.js worker 通过 Vite ?url 引入
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PdfDocProxy = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};
type PdfPageProxy = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

export function PdfPreview({ path }: { path: string }) {
  const [pdf, setPdf] = useState<PdfDocProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PdfDocProxy | null = null;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pdfjsLib = (await import("pdfjs-dist")) as unknown as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (src: { url: string }) => { promise: Promise<PdfDocProxy> };
        };
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        const url = convertFileSrc(path);
        const task = pdfjsLib.getDocument({ url });
        doc = await task.promise;
        if (!cancelled) {
          setPdf(doc);
          setPageNum(1);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (doc) doc.destroy().catch(() => {});
    };
  }, [path]);

  // 渲染当前页
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
      } catch (e) {
        if (!cancelled) {
          const msg = String(e);
          if (!msg.includes("cancelled")) setError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, pageNum, scale]);

  const goPrev = useCallback(() => setPageNum((n) => Math.max(1, n - 1)), []);
  const goNext = useCallback(
    () => setPageNum((n) => Math.min(pdf?.numPages ?? n, n + 1)),
    [pdf]
  );
  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.4)), []);
  const resetZoom = useCallback(() => setScale(1.2), []);

  // 键盘翻页
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" || e.key === "PageUp") goPrev();
      else if (e.key === "ArrowRight" || e.key === "PageDown") goNext();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-" || e.key === "_") zoomOut();
      else if (e.key === "0") resetZoom();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goPrev, goNext, zoomIn, zoomOut, resetZoom]);

  if (loading) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>加载 PDF...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="preview-error">
        <p>PDF 加载失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (!pdf) return null;

  return (
    <div className="preview-pdf-container">
      <div className="pdf-toolbar">
        <button className="compact-button secondary" onClick={goPrev} disabled={pageNum <= 1}>
          <ChevronLeft size={14} /> 上一页
        </button>
        <span className="pdf-page-indicator">
          <input
            type="number"
            min={1}
            max={pdf.numPages}
            value={pageNum}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setPageNum(Math.max(1, Math.min(pdf.numPages, v)));
            }}
            className="pdf-page-input"
          />
          / {pdf.numPages}
        </span>
        <button
          className="compact-button secondary"
          onClick={goNext}
          disabled={pageNum >= pdf.numPages}
        >
          下一页 <ChevronRight size={14} />
        </button>
        <div className="pdf-toolbar-spacer" />
        <button className="compact-button secondary" onClick={zoomOut} title="缩小 (-)">
          <ZoomOut size={14} />
        </button>
        <span className="zoom-label">{Math.round(scale * 100)}%</span>
        <button className="compact-button secondary" onClick={zoomIn} title="放大 (+)">
          <ZoomIn size={14} />
        </button>
        <button className="compact-button secondary" onClick={resetZoom} title="重置 (0)">
          <RotateCw size={14} />
        </button>
      </div>
      <div className="pdf-canvas-wrapper">
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>
    </div>
  );
}
