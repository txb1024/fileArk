export type RecentFile = {
  name: string;
  path: string;
  category: string;
  size: number;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  alias: string;
  tags: string[];
  path: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  recentFiles: RecentFile[];
};

export type InboxItem = {
  id: string;
  name: string;
  sourcePath: string;
  size: number;
  modifiedAt: string;
  recommendedProjectId: string | null;
  recommendedCategory: string;
  status: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  type: string;
  title: string;
  createdAt: string;
};

export type AppData = {
  projects: Project[];
  inbox: InboxItem[];
  activities: Activity[];
  settings: {
    workspaceRoot: string;
    categories: string[];
  };
};

export type CreateProjectInput = {
  name: string;
  alias?: string;
  tags?: string[];
  root?: string;
  pinned?: boolean;
};

export type OrganizeInput = {
  itemIds: string[];
  projectId: string;
  category: string;
};

export type AddFilesToCategoryInput = {
  projectId: string;
  category: string;
  filePaths: string[];
};

export type CategoryFile = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  children?: CategoryFile[];
};

export type CreateCategoryFolderInput = {
  projectId: string;
  category: string;
  folderName: string;
};

export type WorkspaceMeta = {
  id: string;
  name: string;
  dataFile: string;
  createdAt: string;
};

export type WorkspaceRegistry = {
  activeWorkspaceId: string;
  workspaces: WorkspaceMeta[];
};

export type MigrateRootInput = {
  oldRoot: string;
  newRoot: string;
  migrate: boolean;
};

// 回收站
export type TrashItem = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  category: string;
  originalPath: string;
  deletedAt: string;
};

// 便签
export type NoteMeta = {
  /** 相对路径，POSIX 分隔符，如 "工作/项目 A/周报.md"。同时是唯一 ID */
  id: string;
  /** 文件名（不含 .md 扩展名） */
  name: string;
  /** 父文件夹相对路径，根目录为 "" */
  parent: string;
  /** 内容首行 # 提取的标题 */
  title: string;
  tags: string[];
  pinned: boolean;
  snippet: string;
  createdAt: string;
  updatedAt: string;
};

/** 树节点 — 文件夹 */
export type NoteFolderNode = {
  type: "folder";
  path: string;
  name: string;
  parent: string;
  children: NoteTreeNode[];
};

/** 树节点 — 便签 */
export type NoteFileNode = NoteMeta & { type: "note" };

export type NoteTreeNode = NoteFolderNode | NoteFileNode;

/** 回收站项 */
export type TrashedNote = {
  trashId: string;
  originalPath: string;
  meta: NoteMeta;
  deletedAt: string;
};

export type CreateNoteInput = {
  parent: string;
  name?: string;
};

export type CreateFolderInput = {
  parent: string;
  name: string;
};

export type UpdateNoteMetaInput = {
  tags?: string[];
  pinned?: boolean;
};

// UI 类型
export type Language = "zh" | "en";
export type ThemeMode = "light" | "dark";
export type AccentColor = "teal" | "blue" | "violet" | "orange";

// 国际化 Messages 类型
export type Messages = {
  appName: string;
  home: string;
  projects: string;
  inbox: string;
  search: string;
  settings: string;
  projectList: string;
  pinned: string;
  openProjectFolder: string;
  searchPlaceholder: string;
  importFiles: string;
  newProject: string;
  categories: string;
  filterByName: string;
  openCategoryFolder: string;
  addFiles: string;
  newFolder: string;
  sortByName: string;
  sortByTime: string;
  sortBySize: string;
  name: string;
  modifiedAt: string;
  size: string;
  dragHint: string;
  emptyCategory: string;
  emptyCategoryBody: string;
  noMatch: string;
  noMatchBody: string;
  folder: string;
  rootFiles: string;
  folderNamePrompt: string;
  deleteFile: string;
  copyFile: string;
  pasteFile: string;
  openFile: string;
  previewFile: string;
  pasteTo: string;
  confirmDelete: string;
  expand: string;
  collapse: string;
  language: string;
  theme: string;
  accent: string;
  light: string;
  dark: string;
  scale: string;
  noRootWarning: string;
  goToSettings: string;
  migrateTitle: string;
  migrateBody: string;
  migrateConfirm: string;
  migrateSkip: string;
  migrateCancel: string;
  autostart: string;
  autostartDesc: string;
  trash: string;
  emptyTrash: string;
  emptyTrashConfirm: string;
  restoreProject: string;
  permanentlyDelete: string;
  trashEmpty: string;
  trashEmptyBody: string;
  deletedAt: string;
  // HomeView
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  metricProjectCount: string;
  metricInboxCount: string;
  metricPinnedCount: string;
  metricWorkspaceRoot: string;
  metricRootNotSet: string;
  recentProjects: string;
  recentActivity: string;
  emptyProjectTitle: string;
  emptyProjectBody: string;
  emptyActivityTitle: string;
  emptyActivityBody: string;
  importToInbox: string;
  // InboxView
  inboxEyebrow: string;
  inboxTitle: string;
  inboxBody: string;
  organizeSelected: string;
  deleteSelected: string;
  clearAll: string;
  applyRecommend: string;
  noMatchProject: string;
  inboxEmptyTitle: string;
  inboxEmptyBody: string;
  removeFromInbox: string;
  // SearchView
  searchEyebrow: string;
  searchTitle: string;
  searchBody: string;
  searchPlaceholderLarge: string;
  searchStartTitle: string;
  searchStartBody: string;
  searchProjects: string;
  searchRecentFiles: string;
  searchInbox: string;
  // SettingsView
  settingsTitle: string;
  settingsBody: string;
  appearance: string;
  themeLabel: string;
  accentLabel: string;
  general: string;
  storage: string;
  workspaceRoot: string;
  workspaceRootDesc: string;
  workspaceRootNotSet: string;
  changeRoot: string;
  categoryManagement: string;
  editCategory: string;
  database: string;
  currentDatabase: string;
  switchDatabase: string;
  renameDatabase: string;
  deleteDatabase: string;
};

export type ArchiveApi = {
  getData: () => Promise<AppData>;
  selectRoot: () => Promise<string | null>;
  selectFiles: () => Promise<string[]>;
  createProject: (input: CreateProjectInput) => Promise<AppData>;
  togglePin: (projectId: string) => Promise<AppData>;
  markProjectOpened: (projectId: string) => Promise<AppData>;
  updateRoot: (root: string) => Promise<AppData>;
  checkRootFiles: (root: string) => Promise<number>;
  migrateRoot: (input: MigrateRootInput) => Promise<AppData>;
  addInboxFiles: (filePaths: string[]) => Promise<AppData>;
  organizeInbox: (input: OrganizeInput) => Promise<AppData>;
  deleteInboxItems: (itemIds: string[]) => Promise<AppData>;
  clearInbox: () => Promise<AppData>;
  addFilesToCategory: (input: AddFilesToCategoryInput) => Promise<AppData>;
  createCategoryFolder: (input: CreateCategoryFolderInput) => Promise<CategoryFile[]>;
  listCategoryFiles: (projectPath: string, category: string) => Promise<CategoryFile[]>;
  getCategoryCounts: (projectPath: string, categories: string[]) => Promise<Record<string, number>>;
  openFile: (filePath: string) => Promise<void>;
  openFolder: (folderPath: string) => Promise<void>;
  listWorkspaces: () => Promise<WorkspaceRegistry>;
  createWorkspace: (name: string) => Promise<WorkspaceRegistry>;
  switchWorkspace: (workspaceId: string) => Promise<AppData>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<WorkspaceRegistry>;
  deleteWorkspace: (workspaceId: string) => Promise<WorkspaceRegistry>;
  getAutostartEnabled: () => Promise<boolean>;
  setAutostartEnabled: (enabled: boolean) => Promise<void>;
  updateCategories: (categories: string[]) => Promise<AppData>;
  getTrashItems: () => Promise<TrashItem[]>;
  deleteProject: (projectId: string) => Promise<AppData>;
  restoreProject: (trashItemId: string) => Promise<AppData>;
  permanentlyDeleteTrashItem: (trashItemId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  sendNotification: (title: string, body: string) => Promise<void>;
  readFileContent: (filePath: string) => Promise<string>;
  readFileBinary: (filePath: string) => Promise<string>;
  getPreviewInfo: (filePath: string) => Promise<{
    name: string;
    ext: string;
    size: number;
    is_text: boolean;
    is_image: boolean;
    previewType: string;
  }>;
  deleteFile: (filePath: string) => Promise<void>;
  copyFileTo: (input: { sourcePath: string; targetPath: string }) => Promise<void>;
  moveFileTo: (input: { sourcePath: string; targetPath: string }) => Promise<void>;
  readClipboardFiles: () => Promise<string[]>;
  startWatching: (path: string) => Promise<void>;
  stopWatching: () => Promise<void>;
  searchProjectFiles: (query: string) => Promise<
    Array<{ name: string; path: string; projectName: string; category: string; size: number; isDirectory: boolean }>
  >;
  // 便签
  listNotesTree: () => Promise<NoteTreeNode[]>;
  getNoteContent: (id: string) => Promise<string>;
  createNote: (input: CreateNoteInput) => Promise<NoteMeta>;
  createFolder: (input: CreateFolderInput) => Promise<NoteTreeNode>;
  saveNote: (id: string, content: string) => Promise<NoteMeta>;
  updateNoteMeta: (id: string, input: UpdateNoteMetaInput) => Promise<void>;
  renameNote: (id: string, newName: string) => Promise<NoteMeta>;
  renameFolder: (path: string, newName: string) => Promise<string>;
  moveNote: (id: string, newParent: string) => Promise<NoteMeta>;
  moveFolder: (path: string, newParent: string) => Promise<string>;
  deleteNote: (id: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  searchNotes: (query: string) => Promise<NoteMeta[]>;
  listTrashedNotes: () => Promise<TrashedNote[]>;
  restoreNote: (trashId: string) => Promise<NoteMeta>;
  permanentlyDeleteNote: (trashId: string) => Promise<void>;
  emptyNotesTrash: () => Promise<void>;
  /** 保存便签内嵌资源（图片等），返回绝对路径，前端用 convertFileSrc 转 webview URL */
  saveNoteAsset: (data: string, ext: string) => Promise<string>;
};

