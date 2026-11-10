const versionEl = document.querySelector("#version");
const electronEl = document.querySelector("#electron");
const nodeEl = document.querySelector("#node");
const countEl = document.querySelector("#count");
const pathEl = document.querySelector("#path");
const closeBtn = document.querySelector("#closeBtn");

async function init() {
    const stats = await window.monitorApi.getStats();
    versionEl.textContent  = stats.version;
    electronEl.textContent = stats.electron;
    nodeEl.textContent = stats.node;
    countEl.textContent = stats.samples;
    pathEl.textContent = stats.filePath
}

closeBtn.addEventListener("click", () => {
    window.close()
})

init();