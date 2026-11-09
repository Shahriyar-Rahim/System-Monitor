const { BrowserWindow, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { eventLoopUtilization } = require("perf_hooks");


// memory monitor state
let previousCpu = null
let previousNet = null
let samples = 0
let logVersion = 0;
const history = [];
const MAX_HISTORY = 120;
const MAX_LOG = 500;
const peaks = { cpu: 0, ram: 0}
const lastWarning = {}

const defaultSettings = { refreshMs: 2000, warnCpu: 90, warnRam: 90, warnDisk: 90 }

function getLogFilePath () {
  return path.join(app.getPath("userData"), "system_log.json"); 
}

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readJson(file, fallback) {
  try {
    if(!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    console.error("Could not read", file, error.message);
    return fallback
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null,2), "utf-8")
}

function readLog() {
  const data = readJson(getLogFilePath(), []);
  return Array.isArray(data) ? data : [];
}

function writeLog(events) {
  writeJSON(getLogFilePath(), events.slice(-MAX_LOG))
}

function readSettings() {
  const data = readJson(getSettingsFilePath(), {})
  return { ...defaultSettings, ...(data && typeof data === "object" ? data : {})}
} 

function writeSettings(settings) {
  writeJSON(getSettingsFilePath(), settings)
}

function addLogEvent(type, msg) {
  const ev = readLog();
  ev.push({
    time: Date.now(),
    type,
    msg
  })
  writeLog(ev);
  logVersion++;
}

function warnOnce(key, m) {
  let date = Date.now();
  if(date - (lastWarning[key] || 0) < 60000) return;
  lastWarning[key] = date;
  addLogEvent("warning", m);
}

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

  // addLogEvent('test', 'hello') //"TODO: delete this test"
  // console.log(readLog())
  // console.log(readSettings())

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
