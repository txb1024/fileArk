export type ProjectStatus = "進行中" | "待處理" | "已歸檔";

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
  status: ProjectStatus;
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
  status?: ProjectStatus;
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

export type ArchiveApi = {
  getData: () => Promise<AppData>;
  selectRoot: () => Promise<string | null>;
  selectFiles: () => Promise<string[]>;
  createProject: (input: CreateProjectInput) => Promise<AppData>;
  togglePin: (projectId: string) => Promise<AppData>;
  markProjectOpened: (projectId: string) => Promise<AppData>;
  updateRoot: (root: string) => Promise<AppData>;
  addInboxFiles: (filePaths: string[]) => Promise<AppData>;
  organizeInbox: (input: OrganizeInput) => Promise<AppData>;
  addFilesToCategory: (input: AddFilesToCategoryInput) => Promise<AppData>;
  createCategoryFolder: (input: CreateCategoryFolderInput) => Promise<CategoryFile[]>;
  listCategoryFiles: (projectPath: string, category: string) => Promise<CategoryFile[]>;
  openFile: (filePath: string) => Promise<void>;
  openFolder: (folderPath: string) => Promise<void>;
};

declare global {
  interface Window {
    archiveApi: ArchiveApi;
  }
}
