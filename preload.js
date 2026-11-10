const { contextBridge, ipcRenderer } = require("electron");


contextBridge.exposeInMainWorld("monitorApi", {
  getInfo: () => ipcRenderer.invoke("system:get-info"),
  getSnapshot: () => ipcRenderer.invoke("system:get-snapshot"),
  resetPeaks: () => ipcRenderer.invoke("peaks:reset"),
  loadSetting: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  loadLog: () => ipcRenderer.invoke("log:load"),
  clearLog: () => ipcRenderer.invoke("log:clear"),
  getDataPath: () => ipcRenderer.invoke("app:get-data-path"),
  log: (message) => ipcRenderer.send("renderer:log", message),
  exportStats: () => ipcRenderer.invoke("stats:export")
});