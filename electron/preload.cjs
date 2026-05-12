const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archiveApi", {
  getData: () => ipcRenderer.invoke("data:get"),
  selectRoot: () => ipcRenderer.invoke("dialog:select-root"),
  selectFiles: () => ipcRenderer.invoke("dialog:select-files"),
  createProject: (input) => ipcRenderer.invoke("project:create", input),
  togglePin: (projectId) => ipcRenderer.invoke("project:toggle-pin", projectId),
  markProjectOpened: (projectId) => ipcRenderer.invoke("project:mark-opened", projectId),
  updateRoot: (root) => ipcRenderer.invoke("settings:update-root", root),
  addInboxFiles: (filePaths) => ipcRenderer.invoke("inbox:add-files", filePaths),
  organizeInbox: (input) => ipcRenderer.invoke("inbox:organize", input),
  deleteInboxItems: (itemIds) => ipcRenderer.invoke("inbox:delete", itemIds),
  clearInbox: () => ipcRenderer.invoke("inbox:clear"),
  addFilesToCategory: (input) => ipcRenderer.invoke("category:add-files", input),
  createCategoryFolder: (input) => ipcRenderer.invoke("category:create-folder", input),
  listCategoryFiles: (projectPath, category) => ipcRenderer.invoke("category:list-files", projectPath, category),
  openFile: (filePath) => ipcRenderer.invoke("file:open", filePath),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
  listWorkspaces: () => ipcRenderer.invoke("workspace:list"),
  createWorkspace: (name) => ipcRenderer.invoke("workspace:create", name),
  switchWorkspace: (workspaceId) => ipcRenderer.invoke("workspace:switch", workspaceId),
  renameWorkspace: (workspaceId, name) => ipcRenderer.invoke("workspace:rename", workspaceId, name),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke("workspace:delete", workspaceId)
});
