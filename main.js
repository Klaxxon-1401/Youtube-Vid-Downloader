const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

app.disableHardwareAcceleration();

let mainWindow;

// Binary resolution helpers
// Checks if a binary exists in system PATH
function findBinary(binaryName) {
    const isWin = process.platform === 'win32';
    try {
        const cmd = isWin ? `where ${binaryName}` : `which ${binaryName}`;
        const stdout = execSync(cmd, { stdio: 'pipe' }).toString().trim();
        if (stdout) {
            const firstPath = stdout.split('\n')[0].trim();
            if (fs.existsSync(firstPath)) return firstPath;
        }
    } catch (e) {
        // Not in PATH
    }
    return null;
}

function checkDependencies() {
    const ffmpeg = findBinary('ffmpeg');
    const ytdlp = findBinary('yt-dlp') || findBinary('yt-dlp-linux');
    const phantomjs = findBinary('phantomjs');

    console.log('Dependency Check:', {
        ffmpeg: ffmpeg || 'MISSING',
        ytdlp: ytdlp || 'MISSING',
        phantomjs: phantomjs || 'OPTIONAL/MISSING'
    });

    const missing = [];
    if (!ffmpeg) missing.push('ffmpeg');
    if (!ytdlp) missing.push('yt-dlp');

    if (missing.length > 0) {
        dialog.showErrorBox(
            "Dependency Missing",
            `The following required packages are not found in your system PATH: ${missing.join(', ')}\n\nThese packages are mandatory for proper function. Please install them and ensure they are added to your PATH.`
        );
        app.quit();
        return false;
    }
    return true;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 600,
        minWidth: 500,
        minHeight: 500,
        frame: false,
        backgroundColor: '#121212',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'logo.png')
    });

    mainWindow.loadFile('src/index.html');
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.show();
        }
    });

    app.whenReady().then(() => {
        if (checkDependencies()) {
            createWindow();
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

ipcMain.on('download-video', (event, { url, savePath }) => {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'yt-dlp' : 'yt-dlp-linux';

    // Check for yt-dlp specially as it might be named differently or in PATH
    let binaryPath = findBinary(binaryName);
    if (!binaryPath && isWin) binaryPath = findBinary('yt-dlp'); // fallback
    if (!binaryPath && !isWin) binaryPath = findBinary('yt-dlp'); // fallback

    if (!binaryPath) {
        mainWindow.webContents.send('download-error', `Engine ${binaryName} not found! This package is mandatory.`);
        return;
    }

    const spawnEnv = {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        LC_ALL: 'en_US.UTF-8'
    };

    const ffmpegPath = findBinary('ffmpeg');
    const phantomjsPath = findBinary('phantomjs');

    const args = [
        '-f', 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', ffmpegPath,
        '--write-auto-subs',
        '--write-subs',
        '--sub-langs', 'en',
        '--embed-subs',
        '--newline',
        '--progress',
        '--concurrent-fragments', '5',
        '-o', path.join(savePath, '%(title)s.%(ext)s'),
        url
    ];

    if (phantomjsPath) {
        args.unshift('--js-runtime', phantomjsPath);
    }

    const ydl = spawn(binaryPath, args, { env: spawnEnv });

    let errorLog = '';

    ydl.on('error', (err) => {
        mainWindow.webContents.send('download-error', `Failed to start engine: ${err.message}`);
    });

    ydl.stdout.on('data', (data) => {
        const output = data.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%\s+of\s+~?\s*([\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)/);

        if (progressMatch) {
            const [_, percent, size, speed, eta] = progressMatch;
            mainWindow.webContents.send('download-progress', {
                type: 'progress',
                data: { percent: parseFloat(percent), speed, eta }
            });
        } else if (output.includes('[Merger]')) {
            mainWindow.webContents.send('download-progress', { type: 'status', data: 'Merging files...' });
        } else if (output.includes('[EmbedSubtitle]')) {
            mainWindow.webContents.send('download-progress', { type: 'status', data: 'Embedding subtitles...' });
        }
    });

    ydl.stderr.on('data', (data) => { errorLog += data.toString(); });

    ydl.on('close', (code) => {
        if (code === 0) {
            mainWindow.webContents.send('download-progress', { type: 'complete', data: 'Success' });
        } else {
            mainWindow.webContents.send('download-progress', { type: 'error', data: errorLog.trim() || `Exit code ${code}` });
        }
    });
});

ipcMain.on('window-control', (event, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'close') mainWindow.close();
});
