const { ipcRenderer } = require('electron');

const urlInput = document.getElementById('url-input');
const pathInput = document.getElementById('path-input');
const browseBtn = document.getElementById('browse-btn');
const downloadBtn = document.getElementById('download-btn');
const statusText = document.getElementById('status-text');
const percentText = document.getElementById('percent-text');
const progressBar = document.getElementById('progress-bar');
const speedText = document.getElementById('speed-text');
const etaText = document.getElementById('eta-text');

// Window Controls
document.getElementById('min-btn').addEventListener('click', () => {
    ipcRenderer.send('window-control', 'minimize');
});

document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('window-control', 'close');
});

// Browse
browseBtn.addEventListener('click', async () => {
    const path = await ipcRenderer.invoke('select-directory');
    if (path) {
        pathInput.value = path;
    }
});

// Set default path if empty (optional, requires default logic)
// For now user must select or we send empty and backend handles default?
// Backend expects a path. Let's force selection or default to home/Downloads
// Actually in main.js we could handle default, but JS can't easily guess non-standard paths without os.homedir().
// We'll require input or leave blank to prompt user.

// Download
downloadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const savePath = pathInput.value.trim();

    if (!url) {
        alert("Please enter a YouTube URL");
        return;
    }
    if (!savePath) {
        alert("Please select a save location");
        return;
    }

    // Reset UI
    downloadBtn.disabled = true;
    downloadBtn.innerText = "Downloading...";
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    statusText.innerText = "Starting...";

    ipcRenderer.send('download-video', { url, savePath });
});

// Progress Updates
ipcRenderer.on('download-progress', (event, data) => {
    if (data.type === 'progress') {
        const { percent, speed, eta } = data.data;
        progressBar.style.width = `${percent}%`;
        percentText.innerText = `${Math.round(percent)}%`;
        statusText.innerText = "Downloading...";

        const speedMb = speed ? (speed / 1024 / 1024).toFixed(1) + " MB/s" : "";
        const etaS = eta ? eta + "s" : "";

        speedText.innerText = speedMb;
        etaText.innerText = etaS ? `ETA: ${etaS}` : "";
    } else if (data.type === 'status') {
        statusText.innerText = data.data;
    }
    else if (data.type === 'complete') {
        statusText.innerText = "Download Complete!";
        progressBar.style.width = '100%';
        percentText.innerText = '100%';
        downloadBtn.disabled = false;
        downloadBtn.innerText = "Download Another";
        alert(`Download Complete!\n${data.data}`);
    } else if (data.type === 'error') {
        statusText.innerText = "Error Occurred";
        downloadBtn.disabled = false;
        downloadBtn.innerText = "Retry Download";
        alert(`Error: ${data.data}`);
    }
});

ipcRenderer.on('download-error', (event, msg) => {
    statusText.innerText = "Download Failed";
    downloadBtn.disabled = false;
    downloadBtn.innerText = "Retry";
    console.error("Download Error:", msg);
    alert(`Download Error:\n\n${msg}`);
});
