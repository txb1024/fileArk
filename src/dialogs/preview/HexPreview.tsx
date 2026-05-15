import { useMemo } from "react";
import { base64ToUint8Array, formatSize } from "./utils";

const BYTES_PER_ROW = 16;
const MAX_BYTES = 64 * 1024; // 64KB 上限避免 DOM 爆炸

function detectMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  const head = Array.from(bytes.subarray(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  // 常见 magic
  const sigs: { hex: string; type: string }[] = [
    { hex: "89 50 4e 47", type: "PNG 图片" },
    { hex: "ff d8 ff", type: "JPEG 图片" },
    { hex: "47 49 46 38", type: "GIF 图片" },
    { hex: "25 50 44 46", type: "PDF 文档" },
    { hex: "50 4b 03 04", type: "ZIP / Office 文档 / EPUB" },
    { hex: "1f 8b 08", type: "GZIP 压缩" },
    { hex: "52 61 72 21", type: "RAR 压缩" },
    { hex: "37 7a bc af", type: "7Z 压缩" },
    { hex: "7f 45 4c 46", type: "ELF 可执行" },
    { hex: "4d 5a", type: "Windows EXE/DLL (PE)" },
    { hex: "ca fe ba be", type: "Java Class / Mach-O FAT" },
    { hex: "00 00 01 00", type: "ICO 图标" },
    { hex: "52 49 46 46", type: "WAV / AVI / WebP (RIFF)" },
    { hex: "49 44 33", type: "MP3 (ID3)" },
    { hex: "66 4c 61 43", type: "FLAC 音频" },
    { hex: "ff fb", type: "MP3 音频" },
    { hex: "ef bb bf", type: "UTF-8 with BOM 文本" },
    { hex: "fe ff", type: "UTF-16 BE 文本" },
    { hex: "ff fe", type: "UTF-16 LE 文本" },
  ];
  for (const sig of sigs) {
    if (head.startsWith(sig.hex)) return `${sig.type}（${sig.hex}）`;
  }
  return null;
}

function rowToHex(row: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < BYTES_PER_ROW; i++) {
    if (i < row.length) parts.push(row[i].toString(16).padStart(2, "0"));
    else parts.push("  ");
    if (i === 7) parts.push(" ");
  }
  return parts.join(" ");
}

function rowToAscii(row: Uint8Array): string {
  let s = "";
  for (let i = 0; i < row.length; i++) {
    const b = row[i];
    s += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
  }
  return s;
}

export function HexPreview({ base64 }: { base64: string }) {
  const { rows, totalSize, magic, truncated } = useMemo(() => {
    const bytes = base64ToUint8Array(base64);
    const totalSize = bytes.length;
    const magic = detectMagic(bytes);
    const sliced = bytes.subarray(0, MAX_BYTES);
    const truncated = bytes.length > MAX_BYTES;
    const rowCount = Math.ceil(sliced.length / BYTES_PER_ROW);
    const rows: { offset: string; hex: string; ascii: string }[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row = sliced.subarray(i * BYTES_PER_ROW, (i + 1) * BYTES_PER_ROW);
      rows.push({
        offset: (i * BYTES_PER_ROW).toString(16).padStart(8, "0"),
        hex: rowToHex(row),
        ascii: rowToAscii(row),
      });
    }
    return { rows, totalSize, magic, truncated };
  }, [base64]);

  return (
    <div className="preview-hex-container">
      <div className="hex-toolbar">
        <span className="hex-meta">
          总大小 {formatSize(totalSize)} · 显示 {Math.min(totalSize, MAX_BYTES)} / {totalSize} 字节
        </span>
        {magic && <span className="hex-magic">检测到：{magic}</span>}
      </div>
      <div className="hex-viewer">
        <table className="hex-table">
          <thead>
            <tr>
              <th className="hex-col-offset">偏移</th>
              <th className="hex-col-hex">十六进制</th>
              <th className="hex-col-ascii">ASCII</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="hex-cell-offset">{r.offset}</td>
                <td className="hex-cell-hex">{r.hex}</td>
                <td className="hex-cell-ascii">{r.ascii}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div className="hex-truncated-note">已截断显示前 64KB；完整文件请用系统程序打开。</div>
      )}
    </div>
  );
}
