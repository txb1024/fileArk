import { useEffect, useState } from "react";
import { base64ToUint8Array } from "./utils";

interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

interface SheetData {
  name: string;
  rows: number;
  cols: number;
  cells: Map<string, string>; // key: "r,c" -> formatted value
  merges: MergeRange[];
  hidden: Set<string>; // 被合并覆盖、不渲染的单元格 "r,c"
}

const colLetter = (i: number): string => {
  let n = i;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

export function ExcelPreview({ base64, ext }: { base64: string; ext: string }) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("xlsx")
      .then((XLSX) => {
        if (cancelled) return;
        try {
          const bytes = base64ToUint8Array(base64);
          let workbook: ReturnType<typeof XLSX.read>;
          if (ext === "csv") {
            const text = new TextDecoder().decode(bytes);
            workbook = XLSX.read(text, { type: "string" });
          } else {
            workbook = XLSX.read(bytes, { type: "array", cellDates: true });
          }
          const parsed: SheetData[] = workbook.SheetNames.map((name: string) => {
            const sheet = workbook.Sheets[name];
            const ref = sheet["!ref"];
            if (!ref) {
              return { name, rows: 0, cols: 0, cells: new Map(), merges: [], hidden: new Set() };
            }
            const range = XLSX.utils.decode_range(ref);
            const rows = range.e.r + 1;
            const cols = range.e.c + 1;
            const cells = new Map<string, string>();

            for (let r = 0; r <= range.e.r; r++) {
              for (let c = 0; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[addr];
                if (!cell) continue;
                let value = "";
                try {
                  value = XLSX.utils.format_cell(cell);
                } catch {
                  value = String(cell.v ?? "");
                }
                if (value !== "") cells.set(`${r},${c}`, value);
              }
            }

            const merges: MergeRange[] = (sheet["!merges"] as MergeRange[]) || [];
            const hidden = new Set<string>();
            for (const m of merges) {
              for (let r = m.s.r; r <= m.e.r; r++) {
                for (let c = m.s.c; c <= m.e.c; c++) {
                  if (r === m.s.r && c === m.s.c) continue;
                  hidden.add(`${r},${c}`);
                }
              }
            }

            return { name, rows, cols, cells, merges, hidden };
          });
          setSheets(parsed);
        } catch (e) {
          setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64, ext]);

  if (error) {
    return (
      <div className="preview-error">
        <p>Excel 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (sheets.length === 0) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>解析中...</span>
      </div>
    );
  }

  const current = sheets[activeSheet];
  const mergeMap = new Map<string, MergeRange>();
  for (const m of current.merges) {
    mergeMap.set(`${m.s.r},${m.s.c}`, m);
  }

  return (
    <div className="preview-excel-container">
      {sheets.length > 1 && (
        <div className="excel-sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              className={`excel-sheet-tab ${i === activeSheet ? "active" : ""}`}
              onClick={() => setActiveSheet(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="excel-table-wrapper">
        <table className="excel-table">
          <thead>
            <tr>
              <th className="excel-col-header excel-corner"></th>
              {Array.from({ length: current.cols }, (_, ci) => (
                <th key={ci} className="excel-col-header">
                  {colLetter(ci)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: current.rows }, (_, ri) => (
              <tr key={ri} className={ri === 0 ? "excel-header-row" : ""}>
                <td className="excel-row-number">{ri + 1}</td>
                {Array.from({ length: current.cols }, (_, ci) => {
                  const key = `${ri},${ci}`;
                  if (current.hidden.has(key)) return null;
                  const merge = mergeMap.get(key);
                  const value = current.cells.get(key) ?? "";
                  const rowSpan = merge ? merge.e.r - merge.s.r + 1 : undefined;
                  const colSpan = merge ? merge.e.c - merge.s.c + 1 : undefined;
                  return (
                    <td
                      key={ci}
                      rowSpan={rowSpan}
                      colSpan={colSpan}
                      className={ri === 0 ? "excel-header-cell" : ""}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="excel-info">
        {current.rows} 行 · {current.cols} 列 · {sheets.length} 个工作表
        {current.merges.length > 0 && ` · ${current.merges.length} 个合并区域`}
      </div>
    </div>
  );
}
