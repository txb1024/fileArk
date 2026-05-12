const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// ── Chromium 内存 / 性能优化（仅生产环境）───────────────────
if (!isDev) {
  // 禁用 GPU 硬件加速（省 ~30-80 MB，纯文档类应用无影响）
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  // 避免 /dev/shm 共享内存问题（Linux 容器 / CI 场景）
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  // 禁用后台网络活动（减少空闲内存占用）
  app.commandLine.appendSwitch("disable-background-networking");
  // 禁用扩展 / 插件支持（本应用不需要）
  app.commandLine.appendSwitch("disable-extensions");
  // 减少渲染进程优先级（降低整体内存压力）
  app.commandLine.appendSwitch("renderer-process-limit", "1");
}

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

function getRegistryPath() {
  return path.join(app.getPath("userData"), "registry.json");
}

function getWorkspaceDataPath(dataFile) {
  return path.join(app.getPath("userData"), dataFile);
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

async function ensureRegistry() {
  const registryPath = getRegistryPath();
  if (fssync.existsSync(registryPath)) return;

  const oldDataPath = path.join(app.getPath("userData"), "data.json");
  const id = randomUUID();
  const dataFile = `workspace-${id}.json`;

  if (fssync.existsSync(oldDataPath)) {
    await fs.rename(oldDataPath, getWorkspaceDataPath(dataFile));
  } else {
    await fs.mkdir(path.dirname(getWorkspaceDataPath(dataFile)), { recursive: true });
    await fs.writeFile(getWorkspaceDataPath(dataFile), JSON.stringify(createDefaultData(), null, 2), "utf-8");
  }

  const registry = {
    activeWorkspaceId: id,
    workspaces: [{ id, name: "個人項目資料庫", dataFile, createdAt: now() }]
  };
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), "utf-8");
}

async function readRegistry() {
  await ensureRegistry();
  const raw = await fs.readFile(getRegistryPath(), "utf-8");
  return JSON.parse(raw);
}

async function writeRegistry(registry) {
  await fs.writeFile(getRegistryPath(), JSON.stringify(registry, null, 2), "utf-8");
}

async function readData() {
  const registry = await readRegistry();
  const active = registry.workspaces.find((w) => w.id === registry.activeWorkspaceId);
  const dataPath = getWorkspaceDataPath(active.dataFile);
  if (!fssync.existsSync(dataPath)) {
    await fs.writeFile(dataPath, JSON.stringify(createDefaultData(), null, 2), "utf-8");
  }
  const raw = await fs.readFile(dataPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    const backupPath = dataPath + ".corrupt." + Date.now();
    await fs.rename(dataPath, backupPath);
    const fallback = createDefaultData();
    await fs.writeFile(dataPath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeData(data) {
  const registry = await readRegistry();
  const active = registry.workspaces.find((w) => w.id === registry.activeWorkspaceId);
  await fs.writeFile(getWorkspaceDataPath(active.dataFile), JSON.stringify(data, null, 2), "utf-8");
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

ipcMain.handle("inbox:delete", async (_event, itemIds) => {
  const data = await readData();
  const ids = new Set(itemIds);
  data.inbox = data.inbox.filter((item) => !ids.has(item.id));
  await writeData(data);
  return data;
});

ipcMain.handle("inbox:clear", async () => {
  const data = await readData();
  data.inbox = [];
  await writeData(data);
  return data;
});

ipcMain.handle("file:open", async (_event, filePath) => {
  await shell.openPath(filePath);
});

ipcMain.handle("folder:open", async (_event, folderPath) => {
  await shell.openPath(folderPath);
});

ipcMain.handle("workspace:list", async () => readRegistry());

ipcMain.handle("workspace:create", async (_event, name) => {
  const registry = await readRegistry();
  const id = randomUUID();
  const dataFile = `workspace-${id}.json`;
  const emptyData = createDefaultData();
  await fs.writeFile(getWorkspaceDataPath(dataFile), JSON.stringify(emptyData, null, 2), "utf-8");
  registry.workspaces.push({ id, name, dataFile, createdAt: now() });
  registry.activeWorkspaceId = id;
  await writeRegistry(registry);
  return registry;
});

ipcMain.handle("workspace:switch", async (_event, workspaceId) => {
  const registry = await readRegistry();
  if (!registry.workspaces.find((w) => w.id === workspaceId)) {
    throw new Error("找不到資料庫");
  }
  registry.activeWorkspaceId = workspaceId;
  await writeRegistry(registry);
  return readData();
});

ipcMain.handle("workspace:rename", async (_event, workspaceId, newName) => {
  const registry = await readRegistry();
  registry.workspaces = registry.workspaces.map((w) =>
    w.id === workspaceId ? { ...w, name: newName } : w
  );
  await writeRegistry(registry);
  return registry;
});

ipcMain.handle("workspace:delete", async (_event, workspaceId) => {
  const registry = await readRegistry();
  if (registry.workspaces.length <= 1) {
    throw new Error("至少保留一個資料庫");
  }
  const target = registry.workspaces.find((w) => w.id === workspaceId);
  registry.workspaces = registry.workspaces.filter((w) => w.id !== workspaceId);
  if (registry.activeWorkspaceId === workspaceId) {
    registry.activeWorkspaceId = registry.workspaces[0].id;
  }
  if (target) {
    await fs.unlink(getWorkspaceDataPath(target.dataFile)).catch(() => {});
  }
  await writeRegistry(registry);
  return registry;
});
