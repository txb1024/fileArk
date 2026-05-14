/**
 * Tauri drag-drop 支持
 */
export async function setupDragDrop(
  onFilesDropped: (paths: string[]) => void
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
    onFilesDropped(event.payload.paths);
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
