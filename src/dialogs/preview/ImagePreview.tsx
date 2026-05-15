import { ZoomIn, ZoomOut, RotateCw, Camera } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ExifData {
  Make?: string;
  Model?: string;
  DateTimeOriginal?: Date | string;
  ExposureTime?: number;
  FNumber?: number;
  ISO?: number;
  FocalLength?: number;
  LensModel?: string;
  ImageWidth?: number;
  ImageHeight?: number;
  latitude?: number;
  longitude?: number;
}

function formatExposure(t?: number): string | null {
  if (!t) return null;
  if (t >= 1) return `${t.toFixed(1)}s`;
  return `1/${Math.round(1 / t)}s`;
}

function formatDateTime(d?: Date | string): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toLocaleString();
  return String(d);
}

export function ImagePreview({ path, name }: { path: string; name: string }) {
  const src = convertFileSrc(path);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [showExif, setShowExif] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.25)), []);
  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // 解析 EXIF
  useEffect(() => {
    let cancelled = false;
    const ext = name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "tiff", "heic", "heif", "png"].includes(ext || "")) return;
    import("exifr")
      .then(({ default: exifr }) =>
        exifr.parse(src, { gps: true }).then((data: ExifData | undefined) => {
          if (!cancelled && data) setExif(data);
        })
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, name]);

  // 滚轮缩放 + 键盘快捷键
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const wheelHandler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) => Math.max(0.25, Math.min(5, s + (e.deltaY > 0 ? -0.1 : 0.1))));
      }
    };
    el.addEventListener("wheel", wheelHandler, { passive: false });
    return () => el.removeEventListener("wheel", wheelHandler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomIn, zoomOut, resetZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };

  const handleMouseUp = () => setDragging(false);

  const exifEntries: { label: string; value: string | null }[] = exif
    ? [
        { label: "尺寸", value: exif.ImageWidth && exif.ImageHeight ? `${exif.ImageWidth} × ${exif.ImageHeight}` : null },
        { label: "拍摄时间", value: formatDateTime(exif.DateTimeOriginal) },
        { label: "相机", value: [exif.Make, exif.Model].filter(Boolean).join(" ") || null },
        { label: "镜头", value: exif.LensModel || null },
        { label: "光圈", value: exif.FNumber ? `f/${exif.FNumber}` : null },
        { label: "快门", value: formatExposure(exif.ExposureTime) },
        { label: "ISO", value: exif.ISO ? String(exif.ISO) : null },
        { label: "焦距", value: exif.FocalLength ? `${exif.FocalLength} mm` : null },
        {
          label: "GPS",
          value:
            exif.latitude != null && exif.longitude != null
              ? `${exif.latitude.toFixed(5)}, ${exif.longitude.toFixed(5)}`
              : null,
        },
      ].filter((x) => x.value)
    : [];

  return (
    <div
      className="preview-image-container"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={resetZoom}
      style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
    >
      <div className="image-zoom-controls">
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
        {exifEntries.length > 0 && (
          <button
            className={`compact-button ${showExif ? "primary" : "secondary"}`}
            onClick={() => setShowExif((v) => !v)}
            title="EXIF 信息"
          >
            <Camera size={14} />
            EXIF
          </button>
        )}
      </div>
      <img
        src={src}
        alt={name}
        className="preview-image"
        draggable={false}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center center",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
        }}
      />
      {showExif && exifEntries.length > 0 && (
        <div className="image-exif-panel">
          {exifEntries.map((e) => (
            <div key={e.label} className="exif-row">
              <span className="exif-label">{e.label}</span>
              <span className="exif-value">{e.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
