"use strict";

// The only bridge between the page and the machine. Node stays out of the
// renderer; the page can call exactly these, and nothing else.

const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("zbtracker", {
  read: () => call("journal:read"),
  saveDay: (input) => call("journal:saveDay", input),
  patchDay: (id, patch) => call("journal:patchDay", id, patch),
  deleteDay: (id) => call("journal:deleteDay", id),
  addAccount: (input) => call("journal:addAccount", input),
  patchAccount: (id, patch) => call("journal:patchAccount", id, patch),
  deleteAccount: (id) => call("journal:deleteAccount", id),
  archiveAccount: (id) => call("journal:archiveAccount", id),
  addPayout: (id, amount, date) => call("journal:addPayout", id, amount, date),
  deletePayout: (id, payoutId) => call("journal:deletePayout", id, payoutId),
  restoreAccount: (id) => call("journal:restoreAccount", id),
  setTheme: (theme) => call("journal:setTheme", theme),
  setBreakeven: (v) => call("journal:setBreakeven", v),
  setPhase: (id, phase, on) => call("journal:setPhase", id, phase, on),
  addTag: (label) => call("journal:addTag", label),
  renameTag: (from, to) => call("journal:renameTag", from, to),
  deleteTag: (label) => call("journal:deleteTag", label),
  erase: () => call("journal:erase"),
  exportJournal: () => call("journal:export"),
  importJournal: () => call("journal:import"),
  minimize: () => call("app:minimize"),
  toggleMaximize: () => call("app:toggleMaximize"),
  isMaximized: () => call("app:isMaximized"),
  closeWindow: () => call("app:close"),
  /** Subscribes to maximise/restore, including changes Windows makes itself. */
  onMaximized: (fn) => {
    const listener = (_e, value) => fn(Boolean(value));
    ipcRenderer.on("app:maximized", listener);
    return () => ipcRenderer.removeListener("app:maximized", listener);
  },
  revealData: () => call("app:revealData"),
  quit: () => call("app:quit"),
});
