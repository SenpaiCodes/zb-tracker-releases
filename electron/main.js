"use strict";

const { app, BrowserWindow, ipcMain, protocol, dialog, shell, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { Store } = require("./store");

const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER === "1";
const DIST = path.join(__dirname, "..", "dist");

/**
 * The window and taskbar icon. Packaged it lives beside the executable rather
 * than inside app.asar, because Electron will not reliably read a window icon
 * out of an archive — and when the read fails it silently falls back to its own
 * atom logo, which is exactly what shipped.
 */
function iconPath() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "icon.png")]
    : [path.join(__dirname, "..", "build", "icon.png")];
  return candidates.find((p) => fs.existsSync(p)) || undefined;
}

/** @type {Store} */
let store;
/** @type {BrowserWindow | null} */
let win = null;

// The renderer is served over a custom scheme rather than file://, because a
// file:// page is an opaque origin: Web Workers are blocked there, and the
// screenshot reader needs one. Declaring the scheme standard+secure makes the
// page behave like a normal https origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function registerProtocol() {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);

    // app://shot/<file> — a screenshot from the user's data directory.
    if (url.hostname === "shot") {
      const file = store.shotPath(decodeURIComponent(url.pathname.replace(/^\//, "")));
      if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    }

    // app://bundle/<path> — the built front-end.
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const target = path.resolve(DIST, rel);
    if (!target.startsWith(path.resolve(DIST))) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(target)) {
      return net.fetch(pathToFileURL(path.join(DIST, "index.html")).toString());
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0d0f",
    title: "Z&B Tracker",
    autoHideMenuBar: true,
    icon: iconPath(),
    // Frameless: the title bar and its three buttons are both ours. The native
    // overlay only accepts two colours, which looked washed out on the lighter
    // themes. Dragging and Aero Snap still work through -webkit-app-region.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win && win.show());
  // The renderer draws the maximise/restore glyph, so tell it when that changes
  // — including when Windows does it for us via Snap or a double-click.
  const pushMaximized = () => win && win.webContents.send("app:maximized", win.isMaximized());
  win.on("maximize", pushMaximized);
  win.on("unmaximize", pushMaximized);
  win.on("closed", () => {
    win = null;
  });

  // Anything trying to open a new window or navigate away goes to the real
  // browser instead; this app is a single local page.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://") && !url.startsWith("http://localhost:5173")) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) win.loadURL("http://localhost:5173");
  else win.loadURL("app://bundle/index.html");
}

// --- IPC ---------------------------------------------------------------------
// Every handler returns a fresh snapshot of the journal, so the renderer never
// has to merge partial updates.

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "Something went wrong." };
    }
  });
}

function registerIpc() {
  handle("journal:read", () => store.snapshot());
  handle("journal:saveDay", (input) => store.saveDay(input));
  handle("journal:patchDay", (id, patch) => store.patchDay(id, patch));
  handle("journal:deleteDay", (id) => store.deleteDay(id));
  handle("journal:addAccount", (input) => store.addAccount(input));
  handle("journal:patchAccount", (id, patch) => store.patchAccount(id, patch));
  handle("journal:deleteAccount", (id) => store.deleteAccount(id));
  handle("journal:archiveAccount", (id) => store.archiveAccount(id));
  handle("journal:addPayout", (id, amount, date) => store.addPayout(id, amount, date));
  handle("journal:deletePayout", (id, payoutId) => store.deletePayout(id, payoutId));
  handle("journal:restoreAccount", (id) => store.restoreAccount(id));
  handle("journal:setTheme", (theme) => store.setTheme(theme));
  handle("journal:setBreakeven", (v) => store.setBreakevenBand(v));
  handle("journal:setPhase", (id, phase, on) => store.setPhase(id, phase, on));
  handle("journal:addTag", (label) => store.addTag(label));
  handle("journal:renameTag", (from, to) => store.renameTag(from, to));
  handle("journal:deleteTag", (label) => store.deleteTag(label));
  handle("journal:erase", () => store.erase());

  handle("journal:export", async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Export journal",
      defaultPath: `zb-tracker-${stamp}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { saved: false };
    fs.writeFileSync(filePath, JSON.stringify(store.exportPayload(), null, 2), "utf8");
    return { saved: true, filePath };
  });

  handle("journal:import", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Import journal",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePaths.length) return { imported: false };
    const payload = JSON.parse(fs.readFileSync(filePaths[0], "utf8"));
    const { snapshot, imported } = store.importPayload(payload);
    return { imported: true, count: imported, snapshot };
  });

  handle("app:minimize", () => {
    win?.minimize();
    return true;
  });

  handle("app:toggleMaximize", () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  handle("app:isMaximized", () => Boolean(win?.isMaximized()));

  handle("app:close", () => {
    win?.close();
    return true;
  });

  handle("app:revealData", () => {
    shell.openPath(store.dir);
    return true;
  });

  handle("app:quit", () => {
    app.quit();
    return true;
  });
}

// Only ever one instance, so two windows can't write the journal at once.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // The product name has an ampersand in it, and Electron would derive the data
  // folder from that. An `&` in a path is legal but trips up batch files and
  // other tooling, so pin a plain folder name — unless the standard
  // --user-data-dir flag was passed, which must keep winning.
  if (!process.argv.some((a) => a.startsWith("--user-data-dir"))) {
    app.setPath("userData", path.join(app.getPath("appData"), "ZB Tracker"));
  }

  app.whenReady().then(() => {
    // Folders earlier versions used, newest first. Checked only when this
    // install has no journal of its own.
    const appData = app.getPath("appData");
    const legacyDirs = [
      path.join(appData, "Z&B Tracker"),
      path.join(appData, "Tape & Ledger"),
      path.join(appData, "tape-and-ledger"),
    ];
    store = new Store(app.getPath("userData"), legacyDirs);
    registerProtocol();
    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
