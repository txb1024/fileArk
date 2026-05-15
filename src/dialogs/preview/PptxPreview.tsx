import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { base64ToUint8Array } from "./utils";

interface PptxParagraph {
  text: string;
  isTitle: boolean;
  level: number;
}

interface PptxSlide {
  index: number;
  paragraphs: PptxParagraph[];
}

function parseSlideXml(xmlText: string, idx: number): PptxSlide {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const paragraphs: PptxParagraph[] = [];

  // 遍历所有 p:sp 形状节点
  const shapes = doc.getElementsByTagName("p:sp");
  for (let s = 0; s < shapes.length; s++) {
    const shape = shapes[s];
    // 判断是否为标题占位符
    const phNodes = shape.getElementsByTagName("p:ph");
    let isTitleShape = false;
    if (phNodes.length > 0) {
      const phType = phNodes[0].getAttribute("type") || "";
      isTitleShape = phType === "title" || phType === "ctrTitle";
    }
    const txBodies = shape.getElementsByTagName("p:txBody");
    for (let b = 0; b < txBodies.length; b++) {
      const ps = txBodies[b].getElementsByTagName("a:p");
      for (let p = 0; p < ps.length; p++) {
        const para = ps[p];
        const pPr = para.getElementsByTagName("a:pPr")[0];
        const lvl = pPr ? parseInt(pPr.getAttribute("lvl") || "0", 10) : 0;
        const runs = para.getElementsByTagName("a:t");
        const texts: string[] = [];
        for (let r = 0; r < runs.length; r++) {
          texts.push(runs[r].textContent || "");
        }
        const text = texts.join("").trim();
        if (text) {
          paragraphs.push({ text, isTitle: isTitleShape && p === 0, level: lvl });
        }
      }
    }
  }

  return { index: idx, paragraphs };
}

export function PptxPreview({ base64 }: { base64: string }) {
  const [slides, setSlides] = useState<PptxSlide[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("jszip")
      .then(({ default: JSZip }) => {
        if (cancelled) return;
        try {
          const bytes = base64ToUint8Array(base64);
          JSZip.loadAsync(bytes)
            .then(async (zip) => {
              if (cancelled) return;
              const slideFiles: { idx: number; path: string }[] = [];
              const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/;
              for (const path of Object.keys(zip.files)) {
                const m = path.match(slideRegex);
                if (m) slideFiles.push({ idx: parseInt(m[1], 10), path });
              }
              slideFiles.sort((a, b) => a.idx - b.idx);

              const parsed: PptxSlide[] = [];
              for (const sf of slideFiles) {
                const xmlText = await zip.files[sf.path].async("string");
                parsed.push(parseSlideXml(xmlText, sf.idx));
              }

              if (!cancelled) {
                if (parsed.length === 0) setError("此 PPTX 文件中未找到幻灯片");
                else setSlides(parsed);
              }
            })
            .catch((e) => {
              if (!cancelled) setError(String(e));
            });
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64]);

  // 键盘翻页
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") setActiveSlide((s) => Math.max(0, s - 1));
      else if (e.key === "ArrowRight") setActiveSlide((s) => Math.min(slides.length - 1, s + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [slides.length]);

  if (error) {
    return (
      <div className="preview-error">
        <p>PPTX 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (slides.length === 0) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>解析幻灯片...</span>
      </div>
    );
  }

  const current = slides[activeSlide];
  const titleParas = current.paragraphs.filter((p) => p.isTitle);
  const bodyParas = current.paragraphs.filter((p) => !p.isTitle);

  return (
    <div className="preview-pptx-container">
      <div className="pptx-slide-area">
        <div className="pptx-slide-card">
          <div className="pptx-slide-number">Slide {current.index}</div>
          <div className="pptx-slide-canvas">
            {titleParas.length > 0 && (
              <div className="pptx-slide-title">
                {titleParas.map((p, i) => (
                  <div key={i}>{p.text}</div>
                ))}
              </div>
            )}
            {bodyParas.length > 0 && (
              <ul className="pptx-slide-body">
                {bodyParas.map((p, i) => (
                  <li key={i} className={`level-${p.level}`} style={{ marginLeft: p.level * 16 }}>
                    {p.text}
                  </li>
                ))}
              </ul>
            )}
            {current.paragraphs.length === 0 && (
              <div className="pptx-empty-slide">此幻灯片无文本内容</div>
            )}
          </div>
        </div>
      </div>
      <div className="pptx-controls">
        <button
          className="compact-button secondary"
          disabled={activeSlide === 0}
          onClick={() => setActiveSlide((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft size={14} /> 上一页
        </button>
        <span className="pptx-page-indicator">
          {activeSlide + 1} / {slides.length}
        </span>
        <button
          className="compact-button secondary"
          disabled={activeSlide === slides.length - 1}
          onClick={() => setActiveSlide((s) => Math.min(slides.length - 1, s + 1))}
        >
          下一页 <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
