import { useMemo, useState } from "react";
import { Eye, Monitor, Paperclip, Mail, User, Clock } from "lucide-react";
import { base64ToText, formatSize } from "./utils";

interface EmlPart {
  contentType: string;
  contentTransferEncoding: string;
  filename: string | null;
  body: string;
  raw: Uint8Array | null;
}

interface ParsedEml {
  headers: Record<string, string>;
  parts: EmlPart[];
}

function decodeMimeWord(s: string): string {
  // =?charset?Q?text?= or =?charset?B?base64?=
  return s.replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, charset, enc, data) => {
    try {
      const cs = charset.toLowerCase();
      if (enc.toUpperCase() === "B") {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        return new TextDecoder(cs).decode(bytes);
      } else {
        const text = data.replace(/_/g, " ").replace(/=([0-9a-fA-F]{2})/g, (_m: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        const bytes = Uint8Array.from(text, (c: string) => c.charCodeAt(0));
        return new TextDecoder(cs).decode(bytes);
      }
    } catch {
      return data;
    }
  });
}

function parseHeaders(headerBlock: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerBlock.split(/\r?\n/);
  let current = "";
  let lastKey = "";
  for (const line of lines) {
    if (/^[ \t]/.test(line) && lastKey) {
      headers[lastKey] += " " + line.trim();
      continue;
    }
    if (current) {
      const idx = current.indexOf(":");
      if (idx > 0) {
        const key = current.slice(0, idx).trim().toLowerCase();
        const value = decodeMimeWord(current.slice(idx + 1).trim());
        headers[key] = value;
        lastKey = key;
      }
    }
    current = line;
  }
  if (current) {
    const idx = current.indexOf(":");
    if (idx > 0) {
      const key = current.slice(0, idx).trim().toLowerCase();
      headers[key] = decodeMimeWord(current.slice(idx + 1).trim());
    }
  }
  return headers;
}

function getBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary="?([^";]+)"?/i);
  return m ? m[1] : null;
}

function getFilename(headers: Record<string, string>): string | null {
  const cd = headers["content-disposition"];
  if (cd) {
    const m = cd.match(/filename="?([^";]+)"?/i) || cd.match(/filename\*=(?:[^']*'')?([^;]+)/i);
    if (m) return decodeMimeWord(decodeURIComponent(m[1]));
  }
  const ct = headers["content-type"];
  if (ct) {
    const m = ct.match(/name="?([^";]+)"?/i);
    if (m) return decodeMimeWord(m[1]);
  }
  return null;
}

function decodeBody(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    try {
      const cleaned = body.replace(/\s/g, "");
      const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return body;
    }
  }
  if (enc === "quoted-printable") {
    const text = body.replace(/=\r?\n/g, "").replace(/=([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    try {
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return text;
    }
  }
  return body;
}

function parseMime(raw: string): ParsedEml {
  const sepIdx = raw.search(/\r?\n\r?\n/);
  if (sepIdx < 0) {
    return { headers: {}, parts: [{ contentType: "text/plain", contentTransferEncoding: "7bit", filename: null, body: raw, raw: null }] };
  }
  const headerBlock = raw.slice(0, sepIdx);
  const body = raw.slice(sepIdx).replace(/^\r?\n\r?\n/, "");
  const headers = parseHeaders(headerBlock);
  const ct = headers["content-type"] || "text/plain";
  const charset = (ct.match(/charset="?([^";]+)"?/i)?.[1] || "utf-8").toLowerCase();
  const encoding = headers["content-transfer-encoding"] || "7bit";

  if (ct.startsWith("multipart/")) {
    const boundary = getBoundary(ct);
    if (!boundary) {
      return { headers, parts: [{ contentType: ct, contentTransferEncoding: encoding, filename: null, body, raw: null }] };
    }
    const sep = `--${boundary}`;
    const segments = body.split(sep);
    const parts: EmlPart[] = [];
    for (const seg of segments) {
      const trimmed = seg.replace(/^\r?\n/, "").replace(/\r?\n--\s*$/, "");
      if (!trimmed.trim() || trimmed.startsWith("--")) continue;
      const sub = parseMime(trimmed);
      parts.push(...sub.parts);
    }
    return { headers, parts };
  }

  const filename = getFilename(headers);
  const decoded = filename ? body : decodeBody(body, encoding, charset);
  return {
    headers,
    parts: [
      {
        contentType: ct.split(";")[0].trim().toLowerCase(),
        contentTransferEncoding: encoding,
        filename,
        body: decoded,
        raw: null,
      },
    ],
  };
}

export function EmlPreview({ base64 }: { base64: string }) {
  const [bodyMode, setBodyMode] = useState<"render" | "source">("render");
  const parsed = useMemo(() => {
    try {
      return parseMime(base64ToText(base64));
    } catch (e) {
      return { headers: {}, parts: [], error: String(e) } as ParsedEml & { error?: string };
    }
  }, [base64]);

  const headers = parsed.headers || {};
  const allParts = parsed.parts || [];
  const htmlPart = allParts.find((p) => p.contentType === "text/html" && !p.filename);
  const textPart = allParts.find((p) => p.contentType === "text/plain" && !p.filename);
  const attachments = allParts.filter((p) => p.filename);

  const subject = headers["subject"] || "（无主题）";
  const from = headers["from"] || "（未知发件人）";
  const to = headers["to"] || "";
  const date = headers["date"] || "";

  return (
    <div className="preview-eml-container">
      <header className="eml-header">
        <h2 className="eml-subject">{subject}</h2>
        <div className="eml-header-row">
          <Mail size={13} />
          <span className="eml-header-label">From</span>
          <span className="eml-header-value">{from}</span>
        </div>
        {to && (
          <div className="eml-header-row">
            <User size={13} />
            <span className="eml-header-label">To</span>
            <span className="eml-header-value">{to}</span>
          </div>
        )}
        {date && (
          <div className="eml-header-row">
            <Clock size={13} />
            <span className="eml-header-label">Date</span>
            <span className="eml-header-value">{date}</span>
          </div>
        )}
      </header>

      {htmlPart && textPart && (
        <div className="eml-body-toolbar">
          <button
            className={`compact-button ${bodyMode === "render" ? "primary" : "secondary"}`}
            onClick={() => setBodyMode("render")}
          >
            <Eye size={13} /> 渲染
          </button>
          <button
            className={`compact-button ${bodyMode === "source" ? "primary" : "secondary"}`}
            onClick={() => setBodyMode("source")}
          >
            <Monitor size={13} /> 纯文本
          </button>
        </div>
      )}

      <div className="eml-body">
        {htmlPart && bodyMode === "render" ? (
          <iframe
            className="eml-html-frame"
            srcDoc={htmlPart.body}
            title="Email HTML"
            sandbox="allow-same-origin"
          />
        ) : textPart ? (
          <pre className="eml-text">{textPart.body}</pre>
        ) : htmlPart ? (
          <iframe
            className="eml-html-frame"
            srcDoc={htmlPart.body}
            title="Email HTML"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="eml-empty">（无可显示正文）</div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="eml-attachments">
          <div className="eml-attachments-title">
            <Paperclip size={13} /> 附件 ({attachments.length})
          </div>
          {attachments.map((a, i) => (
            <div key={i} className="eml-attachment-item">
              <span className="eml-attachment-name">{a.filename}</span>
              <span className="eml-attachment-meta">
                {a.contentType} · {formatSize(a.body.length)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
