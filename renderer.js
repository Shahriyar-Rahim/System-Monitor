const systemLine = document.querySelector("#systemLine");
const refreshSelect = document.querySelector("#refreshSelect");
const pauseBtn = document.querySelector("#pauseBtn");
const exportBtn = document.querySelector("#exportBtn");
const aboutBtn = document.querySelector("#aboutBtn");
const statusEl = document.querySelector("#status");
const cpuValue = document.querySelector("#cpuValue");
const cpuBar = document.querySelector("#cpuBar");
const cpuGraph = document.querySelector("#cpuGraph");
const cpuInfo = document.querySelector("#cpuInfo");
const coresList = document.querySelector("#coresList");

const ramValue = document.querySelector("#ramValue");
const ramBar = document.querySelector("#ramBar");
const ramGraph = document.querySelector("#ramGraph");
const ramInfo = document.querySelector("#ramInfo");

const disksList = document.querySelector("#disksList");

const netIface = document.querySelector("#netIface");
const netDown = document.querySelector("#netDown");
const netUp = document.querySelector("#netUp");
const netGraph = document.querySelector("#netGraph");
const netTotals = document.querySelector("#netTotals");

const uptimeEl = document.querySelector("#uptime");
const peakCpuEl = document.querySelector("#peakCpu");
const peakRamEl = document.querySelector("#peakRam");
const resetPeaksBtn = document.querySelector("#resetPeaksBtn");
const warnCpuInput = document.querySelector("#warnCpu");
const warnRamInput = document.querySelector("#warnRam");
const warnDiskInput = document.querySelector("#warnDisk");

const logList = document.querySelector("#logList");
const clearLogBtn = document.querySelector("#clearLogBtn");
const dataPathEl = document.querySelector("#dataPath");

let settings = { refreshMs: 2000, warnCpu: 90, warnRam: 90, warnDisk: 90 };
let timer = null;
let paused = false;
let lastLogVersion = -1;

// some helpers for input in and text outt
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return value.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return (days ? days + "d " : " ") + hours + "h " + minutes + "m ";
}

function setBar(fillEl, percent, warnAt) {
  fillEl.style.width = Math.min(100, percent) + "%";
  fillEl.classList.toggle("hot", percent >= warnAt);
}

function drawGraph(canvas, values, max) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const style = getComputedStyle(document.documentElement);
  const line = style.getPropertyValue("--accent").trim() || "#D99A24";
  const grid = style.getPropertyValue("--border").trim() || "#E8E2d5";

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  [0.25, 0.5, 0.75].forEach((f) => {
    ctx.moveTo(0, h * f);
    ctx.lineTo(w, h * f);
  });
  ctx.stroke();

  if (values.length < 2) return;
  const top = max || Math.max(1, ...values);
  const step = w / (values.length - 1);

  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = i * step;
    const y = h - 3 - (Math.min(v, top) / top) * (h - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderCpu(snapshot) {
  cpuValue.textContent = snapshot.cpu.total + "%";
  setBar(cpuBar, snapshot.cpu.total, settings.warnCpu);
  drawGraph(
    cpuGraph,
    snapshot.history.map((h) => h.cpu),
    100,
  );
  
  if (coresList.children.length !== snapshot.cpu.cores.length) {
    coresList.replaceChildren();
    snapshot.cpu.cores.forEach((_, i) => {
      const row = document.createElement("div");
      row.className = "core";
      const label = document.createElement("span");
      label.textContent = "Core " + (i + 1);
      const bar = document.createElement("div");
      bar.className = "bar small";
      const fill = document.createElement("div");
      fill.className = "fill";
      bar.appendChild(fill);
      const value = document.createElement("span");
      value.className = "core-value";
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(value);
      coresList.appendChild(row);
    });
  }
  snapshot.cpu.cores.forEach((percent, i) => {
    const row = coresList.children[i];
    row.querySelector(".fill").style.width = percent + "%";
    row.querySelector(".core-value").textContent = percent + "%";
  });
}


// setInterval(() => {
//   window.monitorApi.getSnapshot().then(renderCpu);
// }, 1000);