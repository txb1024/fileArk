import { useState, useCallback, useEffect, useRef } from "react";
import { setupDragDrop, getDroppedFilePaths, readClipboardFiles } from "../utils";

/**
 * 文件拖拽操作 hook
 */
export function useDragDrop(options: {
  projectPath?: string;
  category?: string;
  onFilesDropped?: (paths: string[]) => void;
}) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggingFile, setDraggingFile] = useState<{ path: string; name: string } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const draggingFileRef = useRef<{ path: string; name: string } | null>(null);

  // Tauri drag-drop 监听
  useEffect(() => {
    if (!options.projectPath || !options.category) return;

    let cancelled = false;
    setupDragDrop(async (paths) => {
      if (!cancelled && options.onFilesDropped) {
        await options.onFilesDropped(paths);
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        return () => unlisten();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [options.projectPath, options.category, options.onFilesDropped]);

  const handleDragStart = useCallback((file: { path: string; name: string }) => {
    draggingFileRef.current = file;
    setDraggingFile(file);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingFileRef.current = null;
    setDraggingFile(null);
    setDragOverFolder(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      e.preventDefault();
      const current = draggingFileRef.current;
      if (current) {
        e.dataTransfer.dropEffect = "move";
        setDragOverFolder(folderPath);
      } else {
        e.dataTransfer.dropEffect = "none";
      }
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverFolder(null);
  }, []);

  return {
    isDraggingFiles,
    setIsDraggingFiles,
    draggingFile,
    dragOverFolder,
    draggingFileRef,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    getDroppedFilePaths
  };
}
