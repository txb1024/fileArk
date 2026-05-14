import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileType,
  type LucideIcon
} from "lucide-react";
import type React from "react";

/**
 * 根据文件名返回对应的图标组件
 */
export function getFileIcon(
  name: string,
  isDirectory: boolean,
  size: number = 16
): React.ReactElement {
  if (isDirectory) return <Folder size={size} className="file-icon" />;

  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconProps = { size, className: "file-icon" };

  const icons: Record<string, { icon: LucideIcon; color: string }> = {
    // 表格
    xlsx: { icon: FileSpreadsheet, color: "#16a34a" },
    xls: { icon: FileSpreadsheet, color: "#16a34a" },
    csv: { icon: FileSpreadsheet, color: "#16a34a" },
    // 演示
    pptx: { icon: FileType, color: "#dc2626" },
    ppt: { icon: FileType, color: "#dc2626" },
    // 文档
    docx: { icon: FileText, color: "#2563eb" },
    doc: { icon: FileText, color: "#2563eb" },
    pdf: { icon: FileText, color: "#dc2626" },
    // 文本
    txt: { icon: FileText, color: "#6b7280" },
    md: { icon: FileText, color: "#6b7280" },
    log: { icon: FileText, color: "#6b7280" },
    // 代码
    js: { icon: FileCode, color: "#7c3aed" },
    ts: { icon: FileCode, color: "#7c3aed" },
    jsx: { icon: FileCode, color: "#7c3aed" },
    tsx: { icon: FileCode, color: "#7c3aed" },
    html: { icon: FileCode, color: "#7c3aed" },
    css: { icon: FileCode, color: "#7c3aed" },
    json: { icon: FileCode, color: "#7c3aed" },
    xml: { icon: FileCode, color: "#7c3aed" },
    yaml: { icon: FileCode, color: "#7c3aed" },
    yml: { icon: FileCode, color: "#7c3aed" },
    // 图片
    png: { icon: FileImage, color: "#0891b2" },
    jpg: { icon: FileImage, color: "#0891b2" },
    jpeg: { icon: FileImage, color: "#0891b2" },
    gif: { icon: FileImage, color: "#0891b2" },
    svg: { icon: FileImage, color: "#0891b2" },
    webp: { icon: FileImage, color: "#0891b2" },
    // 视频
    mp4: { icon: FileVideo, color: "#c2410c" },
    avi: { icon: FileVideo, color: "#c2410c" },
    mov: { icon: FileVideo, color: "#c2410c" },
    wmv: { icon: FileVideo, color: "#c2410c" },
    // 音频
    mp3: { icon: FileAudio, color: "#0891b2" },
    wav: { icon: FileAudio, color: "#0891b2" },
    flac: { icon: FileAudio, color: "#0891b2" },
    aac: { icon: FileAudio, color: "#0891b2" },
    // 压缩包
    zip: { icon: FileArchive, color: "#ca8a04" },
    rar: { icon: FileArchive, color: "#ca8a04" },
    "7z": { icon: FileArchive, color: "#ca8a04" },
    tar: { icon: FileArchive, color: "#ca8a04" },
    gz: { icon: FileArchive, color: "#ca8a04" }
  };

  const match = icons[ext];
  if (match) {
    const Icon = match.icon;
    return <Icon {...iconProps} style={{ color: match.color }} />;
  }

  return <File {...iconProps} style={{ color: "#6b7280" }} />;
}
