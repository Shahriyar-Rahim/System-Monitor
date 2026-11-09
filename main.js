const { BrowserWindow, app } = require("electron");
const path = require("path");

let nainWindow;
let aboutWindow = null;
const loadPreload = path.join(__dirname, "preload.js");

function createWindow() {
  nainWindow = new BrowserWindow({
    width: 980,
    height: 780,
    minHeight: 760,
    minWidth: 560,
    title: "System Monitor",
    webPreferences: {
      preload: loadPreload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  nainWindow.loadFile("index.html");

  nainWindow.on("closed", () => {
    nainWindow = null;
  });
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
