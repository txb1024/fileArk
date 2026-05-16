/**
 * Tauri 2 drag-drop 支持。
 *
 * Tauri 拦截 OS 拖入,通过 webview 事件暴露 paths(WebView2 的 File 对象不含
 * 文件路径)。用官方的 onDragDropEvent API,统一了不同版本 event name/payload 兼容。
 *
 * 同时暴露 enter/leave 供 UI 显示 drop 提示;onDrop 提供 position(CSS 像素)
 * 便于前端用 elementFromPoint 按指针位置路由到不同 drop target。
 */
export interface DropPosition {
  x: number;
  y: number;
}

export interface DragDropHandlers {
  onEnter?: () => void;
  onOver?: (position: DropPosition) => void;
  onLeave?: () => void;
  onDrop: (paths: string[], position: DropPosition) => void;
}

export async function setupDragDrop(
  handlers: DragDropHandlers | ((paths: string[]) => void),
): Promise<() => void> {
  const h: DragDropHandlers =
    typeof handlers === "function" ? { onDrop: (paths) => handlers(paths) } : handlers;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload as {
      type?: string;
      paths?: string[];
      position?: DropPosition;
    };
    const pos: DropPosition = payload?.position ?? { x: 0, y: 0 };
    switch (payload?.type) {
      case "enter":
        h.onEnter?.();
        break;
      case "over":
        h.onOver?.(pos);
        break;
      case "leave":
        h.onLeave?.();
        break;
      case "drop":
        if (Array.isArray(payload.paths) && payload.paths.length > 0) {
          h.onDrop(payload.paths, pos);
        }
        h.onLeave?.();
        break;
    }
  });
  return unlisten;
}

/**
 * 从 HTML5 DragEvent 获取文件路径（Electron 环境兼容）
 */
export function getDroppedFilePaths(event: React.DragEvent): string[] {
  return Array.from(event.dataTransfer.files)
    .map((file) => (file as File & { path?: string }).path)
    .filter((filePath): filePath is string => Boolean(filePath));
}

/**
 * 从剪贴板读取文件路径
 */
export async function readClipboardFiles(): Promise<string[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("read_clipboard_files");
}
