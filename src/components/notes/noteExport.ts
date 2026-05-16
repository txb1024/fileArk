import type { BlockNoteEditor } from "@blocknote/core";

/** 包一份打印/导出用的最小 HTML 模板,字体跟编辑器一致,代码块/引用基础样式 */
export function wrapHtmlDoc(title: string, bodyHtml: string): string {
  const safeTitle = title.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8" />
<title>${safeTitle}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2328; max-width: 760px; margin: 32px auto; padding: 0 24px; line-height: 1.7; }
  h1,h2,h3,h4,h5,h6 { line-height: 1.3; margin-top: 1.6em; }
  pre, code { font-family: "JetBrains Mono", "Cascadia Code", Consolas, Menlo, monospace; }
  pre { background: #f6f8fa; padding: 12px 14px; border-radius: 6px; overflow-x: auto; }
  code { background: #f6f8fa; padding: 0 4px; border-radius: 3px; font-size: 87%; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 3px solid #d0d7de; padding: 4px 14px; color: #57606a; margin: 12px 0; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #d0d7de; padding: 6px 10px; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px dashed #d0d7de; margin: 28px 0; }
  @media print { body { margin: 0; padding: 12mm; } }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** 临时插入隐藏 iframe 渲染 HTML 后调 print(),完成后移除 */
function printViaIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () =>
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // 已移除
      }
    }, 500);
  const tryPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };
  if (doc.readyState === "complete") {
    setTimeout(tryPrint, 50);
  } else {
    iframe.addEventListener("load", () => setTimeout(tryPrint, 50), { once: true });
  }
}

export type ExportKind = "markdown" | "html" | "pdf";

/**
 * 把编辑器当前文档导出为指定格式。
 * markdown/html 弹保存对话框写盘;pdf 用隐藏 iframe 调系统打印。
 *
 * @param editor BlockNote 实例
 * @param baseFilename 不带后缀的文件名(默认对话框文件名)
 */
export async function exportNoteAs(
  editor: BlockNoteEditor<any, any, any>,
  baseFilename: string,
  kind: ExportKind,
): Promise<void> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");

  if (kind === "markdown") {
    const md = await editor.blocksToMarkdownLossy(editor.document);
    const path = await save({
      defaultPath: baseFilename + ".md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (path) await writeTextFile(path, md);
    return;
  }

  const bodyHtml = await editor.blocksToHTMLLossy(editor.document);
  const fullHtml = wrapHtmlDoc(baseFilename, bodyHtml);

  if (kind === "html") {
    const path = await save({
      defaultPath: baseFilename + ".html",
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (path) await writeTextFile(path, fullHtml);
    return;
  }

  printViaIframe(fullHtml);
}
