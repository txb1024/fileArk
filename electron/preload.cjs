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
  addFilesToCategory: (input) => ipcRenderer.invoke("category:add-files", input),
  createCategoryFolder: (input) => ipcRenderer.invoke("category:create-folder", input),
  listCategoryFiles: (projectPath, category) => ipcRenderer.invoke("category:list-files", projectPath, category),
  openFile: (filePath) => ipcRenderer.invoke("file:open", filePath),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath)
});
