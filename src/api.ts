/**
 * Tauri 后端 API 适配层
 * 将 Electron preload 的 window.archiveApi 调用迁移到 Tauri invoke
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AppData,
  ArchiveApi,
  CreateProjectInput,
  OrganizeInput,
  AddFilesToCategoryInput,
  CreateCategoryFolderInput,
  CategoryFile,
  WorkspaceRegistry,
  TrashItem,
  TrashedFile,
  NoteMeta,
  NoteTreeNode,
  TrashedNote,
  CreateNoteInput,
  CreateFolderInput,
  UpdateNoteMetaInput,
} from "./types";

/// 预览文件信息
export interface PreviewInfo {
  name: string;
  ext: string;
  size: number;
  is_text: boolean;
  is_image: boolean;
  previewType: string;
}

export const api: ArchiveApi = {
  getData: () => invoke<AppData>("get_data"),
  selectRoot: () => invoke<string | null>("select_root"),
  selectFiles: () => invoke<string[]>("select_files"),
  createProject: (input) => invoke<AppData>("create_project", { input }),
  togglePin: (projectId) => invoke<AppData>("toggle_pin", { projectId }),
  markProjectOpened: (projectId) => invoke<AppData>("mark_project_opened", { projectId }),
  updateRoot: (root) => invoke<AppData>("update_root", { root }),
  checkRootFiles: (root) => invoke<number>("check_root_files", { root }),
  migrateRoot: (input) => invoke<AppData>("migrate_root", { input }),
  addInboxFiles: (filePaths) => invoke<AppData>("add_inbox_files", { filePaths }),
  organizeInbox: (input) => invoke<AppData>("organize_inbox", { input }),
  deleteInboxItems: (itemIds) => invoke<AppData>("delete_inbox_items", { itemIds }),
  clearInbox: () => invoke<AppData>("clear_inbox"),
  addFilesToCategory: (input) => invoke<AppData>("add_files_to_category", { input }),
  createCategoryFolder: (input) => invoke<CategoryFile[]>("create_category_folder", { input }),
  listCategoryFiles: (projectPath, category) =>
    invoke<CategoryFile[]>("list_category_files_cmd", { projectPath, category }),
  getCategoryCounts: (projectPath: string, categories: string[]) =>
    invoke<Record<string, number>>("get_category_counts", { projectPath, categories }),
  openFile: (filePath) => invoke<void>("open_file", { filePath }),
  openFolder: (folderPath) => invoke<void>("open_folder", { folderPath }),
  listWorkspaces: () => invoke<WorkspaceRegistry>("list_workspaces"),
  createWorkspace: (name) => invoke<WorkspaceRegistry>("create_workspace", { name }),
  switchWorkspace: (workspaceId) => invoke<AppData>("switch_workspace", { workspaceId }),
  renameWorkspace: (workspaceId, name) =>
    invoke<WorkspaceRegistry>("rename_workspace", { workspaceId, newName: name }),
  deleteWorkspace: (workspaceId) => invoke<WorkspaceRegistry>("delete_workspace", { workspaceId }),
  getAutostartEnabled: () => invoke<boolean>("get_autostart_enabled"),
  setAutostartEnabled: (enabled) => invoke<void>("set_autostart_enabled", { enabled }),
  // 分类管理
  updateCategories: (categories) => invoke<AppData>("update_categories", { categories }),
  setNoteAssetsPath: (path) => invoke<AppData>("set_note_assets_path", { path }),
  getNoteAssetsDir: () => invoke<string>("get_note_assets_dir"),
  repairProjectPaths: () => invoke<[number, AppData]>("repair_project_paths"),
  repairWorkspaceRoots: () => invoke<[number, number, AppData]>("repair_workspace_roots"),
  // 回收站
  getTrashItems: () => invoke<TrashItem[]>("get_trash_items"),
  deleteProject: (projectId) => invoke<AppData>("delete_project", { projectId }),
  renameProject: (projectId, newName) =>
    invoke<AppData>("rename_project", { projectId, newName }),
  restoreProject: (trashItemId) => invoke<AppData>("restore_project", { trashItemId }),
  permanentlyDeleteTrashItem: (trashItemId) => invoke<void>("permanently_delete_trash_item", { trashItemId }),
  emptyTrash: () => invoke<void>("empty_trash"),
  listTrashedFiles: () => invoke<TrashedFile[]>("list_trashed_files"),
  restoreTrashedFile: (fileId) => invoke<string>("restore_trashed_file", { fileId }),
  permanentlyDeleteTrashedFile: (fileId) =>
    invoke<void>("permanently_delete_trashed_file", { fileId }),
  // 通知
  sendNotification: (title, body) => invoke<void>("send_notification", { title, body }),
  // 文件预览
  readFileContent: (filePath: string) => invoke<string>("read_file_content", { filePath }),
  readFileBinary: (filePath: string) => invoke<string>("read_file_binary", { filePath }),
  getPreviewInfo: (filePath: string) => invoke<PreviewInfo>("get_preview_info", { filePath }),
  // 文件操作
  deleteFile: (filePath, context) =>
    invoke<void>("delete_file", {
      filePath,
      projectId: context?.projectId,
      projectName: context?.projectName,
      category: context?.category,
    }),
  copyFileTo: (input: { sourcePath: string; targetPath: string }) => invoke<void>("copy_file_to", { input }),
  moveFileTo: (input: { sourcePath: string; targetPath: string }) => invoke<void>("move_file_to", { input }),
  readClipboardFiles: () => invoke<string[]>("read_clipboard_files"),
  startWatching: (path: string) => invoke<void>("start_watching", { path }),
  stopWatching: () => invoke<void>("stop_watching"),
  searchProjectFiles: (query: string) =>
    invoke<Array<{ name: string; path: string; projectName: string; category: string; size: number; isDirectory: boolean }>>(
      "search_project_files",
      { query }
    ),
  // 便签
  listNotesTree: () => invoke<NoteTreeNode[]>("list_notes_tree"),
  getNoteContent: (id: string) => invoke<string>("get_note_content", { id }),
  createNote: (input: CreateNoteInput) => invoke<NoteMeta>("create_note", { input }),
  createFolder: (input: CreateFolderInput) => invoke<NoteTreeNode>("create_folder", { input }),
  saveNote: (id: string, content: string) => invoke<NoteMeta>("save_note", { id, content }),
  updateNoteMeta: (id: string, input: UpdateNoteMetaInput) =>
    invoke<void>("update_note_meta", { id, input }),
  renameNote: (id: string, newName: string) =>
    invoke<NoteMeta>("rename_note", { id, newName }),
  renameFolder: (path: string, newName: string) =>
    invoke<string>("rename_folder", { path, newName }),
  moveNote: (id: string, newParent: string) =>
    invoke<NoteMeta>("move_note", { id, newParent }),
  moveFolder: (path: string, newParent: string) =>
    invoke<string>("move_folder", { path, newParent }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  deleteFolder: (path: string) => invoke<void>("delete_folder", { path }),
  searchNotes: (query: string) => invoke<NoteMeta[]>("search_notes", { query }),
  listTrashedNotes: () => invoke<TrashedNote[]>("list_trashed_notes"),
  restoreNote: (trashId: string) => invoke<NoteMeta>("restore_note", { trashId }),
  permanentlyDeleteNote: (trashId: string) =>
    invoke<void>("permanently_delete_note", { trashId }),
  emptyNotesTrash: () => invoke<void>("empty_notes_trash"),
  saveNoteAsset: (data, ext) => invoke<string>("save_note_asset", { data, ext }),
  listPendingMigrations: () => invoke<string[]>("list_pending_migrations"),
  migrateMdToBnote: (oldId: string, bnoteContent: string) =>
    invoke<NoteMeta>("migrate_md_to_bnote", { oldId, bnoteContent }),
};
