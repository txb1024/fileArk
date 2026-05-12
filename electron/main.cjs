const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const defaultCategories = [
  "01_需求",
  "02_技術方案",
  "03_功能設計",
  "04_表格設計",
  "05_接口文檔",
  "06_會議記錄",
  "07_測試資料",
  "08_截圖素材",
  "09_交付物",
  "99_臨時資料"
];

function getDataPath() {
  return path.join(app.getPath("userData"), "data.json");
}

function getDefaultRoot() {
  return path.join(os.homedir(), "Documents", "個人項目資料庫");
}

function now() {
  return new Date().toISOString();
}

function createDefaultData() {
  return {
    projects: [],
    inbox: [],
    activities: [],
    settings: {
      workspaceRoot: getDefaultRoot(),
      categories: defaultCategories
    }
  };
}

async function ensureData() {
  const dataPath = getDataPath();
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  if (!fssync.existsSync(dataPath)) {
    await fs.writeFile(dataPath, JSON.stringify(createDefaultData(), null, 2), "utf-8");
  }
}

async function readData() {
  await ensureData();
  const raw = await fs.readFile(getDataPath(), "utf-8");
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.writeFile(getDataPath(), JSON.stringify(data, null, 2), "utf-8");
}

function safeFolderName(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

function inferCategory(fileName, categories) {
  const lower = fileName.toLowerCase();
  const rules = [
    { keys: ["需求", "prd"], category: "01_需求" },
    { keys: ["方案", "架構", "設計方案"], category: "02_技術方案" },
    { keys: ["功能", "原型", "流程"], category: "03_功能設計" },
    { keys: ["表", "字段", "資料庫", "database", "sql"], category: "04_表格設計" },
    { keys: ["接口", "api", "json"], category: "05_接口文檔" },
    { keys: ["會議", "紀要", "meeting"], category: "06_會議記錄" },
    { keys: ["測試", "用例", "test"], category: "07_測試資料" },
    { keys: ["截圖", "screenshot", ".png", ".jpg", ".jpeg"], category: "08_截圖素材" },
    { keys: ["交付", "確認", "正式"], category: "09_交付物" }
  ];

  const match = rules.find((rule) => rule.keys.some((key) => lower.includes(key.toLowerCase())));
  if (match && categories.includes(match.category)) return match.category;
  return categories.includes("99_臨時資料") ? "99_臨時資料" : categories[0];
}

function inferProject(fileName, projects) {
  const lower = fileName.toLowerCase();
  return projects.find((project) => {
    const words = [project.name, project.alias, ...(project.tags || [])].filter(Boolean);
    return words.some((word) => lower.includes(String(word).toLowerCase()));
  });
}

async function copyUnique(source, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const parsed = path.parse(source);
  let target = path.join(targetDir, parsed.base);
  let index = 1;
  while (fssync.existsSync(target)) {
    target = path.join(targetDir, `${parsed.name} (${index})${parsed.ext}`);
    index += 1;
  }
  await fs.copyFile(source, target);
  const stat = await fs.stat(target);
  return { target, stat };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 680,
    title: "個人項目資料庫",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("data:get", async () => readData());

ipcMain.handle("dialog:select-root", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:select-files", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("project:create", async (_event, input) => {
  const data = await readData();
  const root = input.root || data.settings.workspaceRoot;
  const folderName = safeFolderName(input.name);
  const projectPath = path.join(root, folderName);
  await fs.mkdir(projectPath, { recursive: true });
  for (const category of data.settings.categories) {
    await fs.mkdir(path.join(projectPath, category), { recursive: true });
  }
  const project = {
    id: randomUUID(),
    name: input.name,
    alias: input.alias || "",
    tags: input.tags || [],
    status: input.status || "進行中",
    path: projectPath,
    pinned: Boolean(input.pinned),
    createdAt: now(),
    updatedAt: now(),
    lastOpenedAt: null,
    recentFiles: []
  };
  data.projects.unshift(project);
  data.activities.unshift({
    id: randomUUID(),
    type: "project:create",
    title: `新建項目：${project.name}`,
    createdAt: now()
  });
  await writeData(data);
  return data;
});

ipcMain.handle("project:toggle-pin", async (_event, projectId) => {
  const data = await readData();
  data.projects = data.projects.map((project) =>
    project.id === projectId ? { ...project, pinned: !project.pinned, updatedAt: now() } : project
  );
  await writeData(data);
  return data;
});

ipcMain.handle("project:mark-opened", async (_event, projectId) => {
  const data = await readData();
  data.projects = data.projects.map((project) =>
    project.id === projectId ? { ...project, lastOpenedAt: now() } : project
  );
  await writeData(data);
  return data;
});

ipcMain.handle("settings:update-root", async (_event, root) => {
  const data = await readData();
  data.settings.workspaceRoot = root;
  await fs.mkdir(root, { recursive: true });
  await writeData(data);
  return data;
});

ipcMain.handle("inbox:add-files", async (_event, filePaths) => {
  const data = await readData();
  const additions = [];
  for (const sourcePath of filePaths) {
    if (!fssync.existsSync(sourcePath)) continue;
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) continue;
    const name = path.basename(sourcePath);
    const recommendedProject = inferProject(name, data.projects);
    additions.push({
      id: randomUUID(),
      name,
      sourcePath,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      recommendedProjectId: recommendedProject?.id || null,
      recommendedCategory: inferCategory(name, data.settings.categories),
      status: "待整理",
      createdAt: now()
    });
  }
  data.inbox.unshift(...additions);
  data.activities.unshift({
    id: randomUUID(),
    type: "inbox:add",
    title: `加入收件箱：${additions.length} 個文件`,
    createdAt: now()
  });
  await writeData(data);
  return data;
});

ipcMain.handle("inbox:organize", async (_event, input) => {
  const data = await readData();
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("找不到項目");
  const category = input.category || data.settings.categories[0];
  const targetDir = path.join(project.path, category);
  const itemIds = new Set(input.itemIds);
  const organized = [];
  const remaining = [];

  for (const item of data.inbox) {
    if (!itemIds.has(item.id)) {
      remaining.push(item);
      continue;
    }
    const copied = await copyUnique(item.sourcePath, targetDir);
    organized.push({ item, copied });
  }

  data.inbox = remaining;
  data.projects = data.projects.map((item) => {
    if (item.id !== project.id) return item;
    const recentFiles = [
      ...organized.map(({ item, copied }) => ({
        name: path.basename(copied.target),
        path: copied.target,
        category,
        size: copied.stat.size,
        updatedAt: now()
      })),
      ...(item.recentFiles || [])
    ].slice(0, 12);
    return { ...item, updatedAt: now(), recentFiles };
  });
  data.activities.unshift({
    id: randomUUID(),
    type: "inbox:organize",
    title: `歸入「${project.name} / ${category}」：${organized.length} 個文件`,
    createdAt: now()
  });
  await writeData(data);
  return data;
});

ipcMain.handle("category:list-files", async (_event, projectPath, category) => {
  return listCategoryFiles(projectPath, category);
});

async function listCategoryFiles(projectPath, category) {
  const categoryPath = path.join(projectPath, category);
  if (!fssync.existsSync(categoryPath)) return [];
  const entries = await fs.readdir(categoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(categoryPath, entry.name);
    const stat = await fs.stat(filePath);
    let children = undefined;
    if (entry.isDirectory()) {
      const childEntries = await fs.readdir(filePath, { withFileTypes: true });
      children = [];
      for (const child of childEntries) {
        const childPath = path.join(filePath, child.name);
        const childStat = await fs.stat(childPath);
        children.push({
          name: child.name,
          path: childPath,
          isDirectory: child.isDirectory(),
          size: childStat.size,
          modifiedAt: childStat.mtime.toISOString()
        });
      }
      children.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant", { numeric: true, sensitivity: "base" }));
    }
    files.push({
      name: entry.name,
      path: filePath,
      isDirectory: entry.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      children
    });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant", { numeric: true, sensitivity: "base" }));
}

ipcMain.handle("category:create-folder", async (_event, input) => {
  const data = await readData();
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("找不到項目");
  const folderName = safeFolderName(input.folderName || "");
  if (!folderName) throw new Error("資料夾名稱不能為空");
  await fs.mkdir(path.join(project.path, input.category, folderName), { recursive: true });
  return listCategoryFiles(project.path, input.category);
});

ipcMain.handle("category:add-files", async (_event, input) => {
  const data = await readData();
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("找不到項目");
  const category = input.category || data.settings.categories[0];
  const targetDir = path.join(project.path, category);
  const added = [];

  for (const sourcePath of input.filePaths || []) {
    if (!fssync.existsSync(sourcePath)) continue;
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) continue;
    const copied = await copyUnique(sourcePath, targetDir);
    added.push(copied);
  }

  data.projects = data.projects.map((item) => {
    if (item.id !== project.id) return item;
    const recentFiles = [
      ...added.map(({ target, stat }) => ({
        name: path.basename(target),
        path: target,
        category,
        size: stat.size,
        updatedAt: now()
      })),
      ...(item.recentFiles || [])
    ].slice(0, 12);
    return { ...item, updatedAt: now(), recentFiles };
  });

  data.activities.unshift({
    id: randomUUID(),
    type: "category:add-files",
    title: `加入「${project.name} / ${category}」：${added.length} 個文件`,
    createdAt: now()
  });
  await writeData(data);
  return data;
});

ipcMain.handle("file:open", async (_event, filePath) => {
  await shell.openPath(filePath);
});

ipcMain.handle("folder:open", async (_event, folderPath) => {
  await shell.openPath(folderPath);
});
