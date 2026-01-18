// Capacitor Mobile Version - Electron IPC removed
// const { ipcRenderer } = require('electron'); // Not available on Android

const urlInput = document.getElementById('url-input');
const pathInput = document.getElementById('path-input');
const browseBtn = document.getElementById('browse-btn');
const downloadBtn = document.getElementById('download-btn');
const statusText = document.getElementById('status-text');
const percentText = document.getElementById('percent-text');
const progressBar = document.getElementById('progress-bar');
const speedText = document.getElementById('speed-text');
const etaText = document.getElementById('eta-text');

// Window Controls - Not needed for Android top bar
document.getElementById('min-btn').style.display = 'none';
document.getElementById('close-btn').style.display = 'none';

// Browse - Android handles file/folder selection differently via Plugins
browseBtn.addEventListener('click', async () => {
    alert("On Mobile, downloads usually go to the Downloads folder automatically.");
    pathInput.value = "/sdcard/Download";
});

// Download
downloadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();

    if (!url) {
        alert("Please enter a YouTube URL");
        return;
    }

    // Reset UI
    downloadBtn.disabled = true;
    downloadBtn.innerText = "Connecting...";
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    statusText.innerText = "Requesting download...";

    /* 
       NOTE: To make this work on Android, you need a server-side backend.
       Example:
       fetch('https://your-api.com/download', {
           method: 'POST',
           body: JSON.stringify({ url: url })
       })
       .then(res => res.json())
       .then(data => alert("Download started on server!"))
    */

    setTimeout(() => {
        statusText.innerText = "Backend required for Mobile";
        alert("The Python backend only works on Desktop. For Android, you would need to host the downloader on a server.");
        downloadBtn.disabled = false;
        downloadBtn.innerText = "Download Now";
    }, 2000);
});
