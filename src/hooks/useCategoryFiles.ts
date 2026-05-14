import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { CategoryFile } from "../types";

/**
 * 分类文件操作 hook
 */
export function useCategoryFiles(projectPath: string | undefined, category: string | undefined) {
  const [files, setFiles] = useState<CategoryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载文件列表
  const refresh = useCallback(async () => {
    if (!projectPath || !category) {
      setFiles([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.listCategoryFiles(projectPath, category);
      setFiles(result);
    } catch (err) {
      setError(String(err));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath, category]);

  // 初始化加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 添加文件
  const addFiles = useCallback(
    async (filePaths: string[]) => {
      if (!projectPath || !category || filePaths.length === 0) return;
      await api.addFilesToCategory({ projectId: projectPath ?? "", category: category ?? "", filePaths });
      await refresh();
    },
    [projectPath, category, refresh]
  );

  // 删除文件
  const deleteFile = useCallback(
    async (filePath: string) => {
      await api.deleteFile(filePath);
      await refresh();
    },
    [refresh]
  );

  // 创建文件夹
  const createFolder = useCallback(
    async (folderName: string) => {
      if (!projectPath || !category || !folderName.trim()) return;
      await api.createCategoryFolder({ projectId: projectPath ?? "", category: category ?? "", folderName: folderName.trim() });
      await refresh();
    },
    [projectPath, category, refresh]
  );

  return {
    files,
    loading,
    error,
    refresh,
    addFiles,
    deleteFile,
    createFolder
  };
}
