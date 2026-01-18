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

// Setup Modal Elements
const setupModal = document.getElementById('setup-modal');
const setupInitial = document.getElementById('setup-initial');
const setupProgressContainer = document.getElementById('setup-progress-container');
const setupComplete = document.getElementById('setup-complete');
const setupError = document.getElementById('setup-error');
const setupStatus = document.getElementById('setup-status');
const setupPercent = document.getElementById('setup-percent');
const setupProgressBar = document.getElementById('setup-progress-bar');
const setupSpeed = document.getElementById('setup-speed');
const setupEta = document.getElementById('setup-eta');
const startSetupBtn = document.getElementById('start-setup-btn');
const closeSetupBtn = document.getElementById('close-setup-btn');
const retrySetupBtn = document.getElementById('retry-setup-btn');
const setupErrorMsg = document.getElementById('setup-error-msg');

// --- Window Controls ---
document.getElementById('min-btn').addEventListener('click', () => {
    ipcRenderer.send('window-control', 'minimize');
});

document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('window-control', 'close');
});

// --- Setup Flow ---
startSetupBtn.addEventListener('click', () => {
    setupInitial.style.display = 'none';
    setupProgressContainer.style.display = 'block';
    ipcRenderer.send('start-setup');
});

retrySetupBtn.addEventListener('click', () => {
    setupError.style.display = 'none';
    setupProgressContainer.style.display = 'block';
    ipcRenderer.send('start-setup');
});

closeSetupBtn.addEventListener('click', () => {
    setupModal.style.display = 'none';
});

ipcRenderer.on('setup-required', (event, missing) => {
    setupModal.style.display = 'flex';
    downloadBtn.disabled = true;
    downloadBtn.innerText = "Setup Required";
});

ipcRenderer.on('setup-progress', (event, data) => {
    if (data.status === 'complete') {
        setupProgressContainer.style.display = 'none';
        setupComplete.style.display = 'block';
        downloadBtn.disabled = false;
        downloadBtn.innerText = "Download Now";
    } else if (data.status === 'error') {
        setupProgressContainer.style.display = 'none';
        setupError.style.display = 'block';
        setupErrorMsg.innerText = data.message || "An error occurred";
    } else {
        // Progress update
        setupStatus.innerText = data.status;
        if (data.percent !== undefined) {
            setupProgressBar.style.width = `${data.percent}%`;
            setupPercent.innerText = `${Math.round(data.percent)}%`;
        }

        if (data.speed) {
            setupSpeed.innerText = (data.speed / 1024 / 1024).toFixed(1) + " MB/s";
        } else {
            setupSpeed.innerText = "";
        }

        if (data.eta) {
            setupEta.innerText = `ETA: ${data.eta}s`;
        } else {
            setupEta.innerText = "";
        }
    }
});

// --- Download Logic ---
browseBtn.addEventListener('click', async () => {
    const path = await ipcRenderer.invoke('select-directory');
    if (path) {
        pathInput.value = path;
    }
});

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

    downloadBtn.disabled = true;
    downloadBtn.innerText = "Downloading...";
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    statusText.innerText = "Starting...";

    ipcRenderer.send('download-video', { url, savePath });
});

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
