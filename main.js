const { time } = require("console");
const { BrowserWindow, app } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { eventLoopUtilization } = require("perf_hooks");

// memory monitor state helpers
let previousCpu = null;
let previousNet = null;
let samples = 0;
let logVersion = 0;
const history = [];
const MAX_HISTORY = 120;
const MAX_LOG = 500;
const peaks = { cpu: 0, ram: 0 };
const lastWarning = {};

const defaultSettings = {
  refreshMs: 2000,
  warnCpu: 90,
  warnRam: 90,
  warnDisk: 90,
};

function getLogFilePath() {
  return path.join(app.getPath("userData"), "system_log.json");
}

function getSettingsFilePath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    console.error("Could not read", file, error.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function readLog() {
  const data = readJson(getLogFilePath(), []);
  return Array.isArray(data) ? data : [];
}

function writeLog(events) {
  writeJSON(getLogFilePath(), events.slice(-MAX_LOG));
}

function readSettings() {
  const data = readJson(getSettingsFilePath(), {});
  return {
    ...defaultSettings,
    ...(data && typeof data === "object" ? data : {}),
  };
}

function writeSettings(settings) {
  writeJSON(getSettingsFilePath(), settings);
}

function addLogEvent(type, msg) {
  const ev = readLog();
  ev.push({
    time: Date.now(),
    type,
    msg,
  });
  writeLog(ev);
  logVersion++;
}

function warnOnce(key, m) {
  let date = Date.now();
  if (date - (lastWarning[key] || 0) < 60000) return;
  lastWarning[key] = date;
  addLogEvent("warning", m);
}
// measurement

function getCpuUsage() {
  const now = os.cpus().map((c) => {
    const t = c.times;
    return {
      idle: t.idle,
      total: t.user + t.nice + t.sys + t.idle + t.irq,
    };
  });

  let cores = [];
  if (previousCpu && previousCpu.length === now.length) {
    cores = now.map((c, i) => {
      const totalDelta = c.total - previousCpu[i].total;
      const idleDelta = c.idle - previousCpu[i].idle;
      return totalDelta > 0
        ? Math.round((100 * (totalDelta - idleDelta)) / totalDelta)
        : 0;
    });
  } else {
    cores = now.map((c) => {
      return c.total > 0 ? Math.round((100 * (c.total - c.idle)) / c.total) : 0;
    });
  }

  previousCpu = now;

  const total = cores.length
    ? Math.round(cores.reduce((a, b) => a + b, 0) / cores.length)
    : 0;

  return {
    total,
    cores,
  };
}
function getMemoryInfo() {
  const total = os.totalmem();
  let available = os.freemem();

  if (process.platform === "linux") {
    try {
      const match = /MemAvailable:\s+(\d+)/.exec(
        fs.readFileSync("/proc/meminfo", "utf-8"),
      );

      if (match) available = Number(match[1] * 1024);
    } catch (error) {
      // os.freemem()
    }
  }
  const u = total - available;
  return {
    total,
    u,
    available,
    percent: Math.round((100 * u) / total),
  };
}

function getDiskInfo() {
  const roots =
    process.platform === "win32"
      ? "CDEFGHIJ".split("").map((l) => l + ":\\")
      : ["/"];

  const disks = [];
  roots.forEach((root) => {
    try {
      const stat = fs.statfsSync(root);
      const t = stat.blocks * stat.bsize;
      const free = stat.bavail * stat.bsize;
      if (t > 0) {
        disks.push({
          name: root,
          t,
          free,
          used: t - free,
          percent: Math.round((100 * (t - free)) / t),
        });
      }
    } catch (error) {
      // skip
    }
  });
  return disks;
}

function getNetworkTotals() {
  return new Promise((r) => {
    try {
      if(process.platform === 'linux') {
        let rx = 0;
        let tx = 0;
        const names = []

        fs.readFileSync('/proc/net/dev', 'utf-8').split("\n").slice(2).forEach((line) => {

          const [name, rest] = line.split(':')

          if(!rest || name.trim() === "lo") return
          const f = rest.trim().split(/\s+/)

          rx += Number(f[0]) || 0;
          tx += Number(f[8]) || 0;

          names.push(name.trim())
        })
        return r({
          rx,
          tx,
          iface: names.join(', ')
        })
      }

      if (process.platform === "darwin") {
        return execFile("netstat", ["-ib"], { timeout: 3000 }, (err, out) => {
          if (err) return resolve(null);

          let rx = 0;
          let tx = 0;

          const seen = new Set();

          out.split("\n").forEach((line) => {
            const c = line.trim().split(/\s+/);

            const isLink = /^<Link/.test(c[2] || "");

            if (c[0] && c[0].startsWith("en") && isLink && !seen.has(c[0])) {
              seen.add(c[0]);

              rx += Number(c[6]) || 0;
              tx += Number(c[9]) || 0;
            }
          });

          r({ rx, tx, iface: [...seen].join(", ") });

        });
      }

      const script = [
        "Get-NetAdapterStatistics",
        "Select-Object Name,ReceivedBytes,SentBytes",
        "ConvertTo-Json",
      ].join(" | ")

      const options = {
        timeout: 5000,
        windowsHide: true
      }

      execFile("powershell", ["-NoProfile", "-Command", script], options, (e, out) => {
        if(e) return r(null)
        try {
          let list = JSON.parse(out)
          if(!Array.isArray(list)) list = [list]
          r({
            rx: list.reduce((a, b) => a + b.ReceivedBytes, 0),
            tx: list.reduce((a, b) => a + b.SentBytes, 0),
            iface: list.map((x) => x.Name).join(", "),
          });
        } catch (error) {
          r(null)
        }
      });
    } catch (error) {
      r(null)
    }
  })
}

// combined snapshot
async function getSnapshot() {
  const settings = readSettings();
  const cpu = getCpuUsage();
  const memory = getMemoryInfo();
  const disks = getDiskInfo();
  const totals = await getNetworkTotals();
  const now = Date.now();

  let rx = 0;
  let tx = 0;

  if (totals && previousNet) {
    const seconds = (now - previousNet.time) / 1000;

    if (seconds > 0) {
      rx = Math.round(Math.max(0, (totals.rx - previousNet.rx) / seconds));
      tx = Math.round(Math.max(0, (totals.tx - previousNet.tx) / seconds));
    }

    if (previousNet.iface !== totals.iface) {
      addLogEvent("network", "Network interfaces changed: " + totals.iface);
    }
  }

  if (totals) {
    previousNet = {
      ...totals,
      time: now,
    };
  }

    samples++;
    history.push({
      time: now, 
      cpu: cpu.total,
      ram: memory.percent,
      rx, 
      tx
    })
    if(history.length > MAX_HISTORY) history.shift();
    if(cpu.total> peaks.cpu) peaks.cpu = cpu.total;
    if (memory.percent > peaks.ram) peaks.ram = memory.percent;
    if (cpu.total >= settings.warnCpu) {
      warnOnce("cpu", "CPU usage at " + cpu.total + "%");
    }

    if (memory.percent >= settings.warnRam) {
      warnOnce('ram', 'Memory usage at ' + memory.percent + '%')
    }

    disks.forEach((d) => {
      if(d.percent >= settings.warnDisk) {
        warnOnce('disk' + d.name , "Storage " + d.name + " at " + d.percent + "%");
      }
    })

    return{
      time: now,
      cpu,
      memory,
      disks,
      network: {
        rx,
        tx,
        totalRx: totals ? totals.rx : null,
        totalsTx: totals ? totals.tx : null,
        iface: totals ? totals.iface : "unavailable"
      },
      uptime: os.uptime(),
      peaks,
      history: history.slice(-60),
      logVersion
    }
}

function getSystemInfo() {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpuModel: cpus.length ? cpus[0].model : "Unknown",
    cpuSpeed: cpus.length ? cpus[0].speed : 0,
    cpuCount: cpus.length, // Call os.cpus().length directly
    totalMemory: os.totalmem(),
  };
}

// main wind
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
  // setInterval(() => console.log("CPU", getCpuUsage()), 1000);
  // console.log(getMemoryInfo());
  // console.log(getDiskInfo());
  // getNetworkTotals()
  // .then((n) => console.log("NET", n))
  // getSnapshot();
  // setInterval(async () => {
  //   const snap = await getSnapshot();
  //   console.log("SNAP", snap.cpu, snap.memory.percent, snap.network);
  // }, 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
