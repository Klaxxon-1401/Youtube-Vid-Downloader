const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

app.disableHardwareAcceleration();

let mainWindow;

// Binary resolution helpers
function getBinDir() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin');
    }
    return path.join(__dirname, 'bin', 'win32');
}

// Checks if a binary exists in bundled bin folder or system PATH
function findBinary(binaryName) {
    const isWin = process.platform === 'win32';
    const fullName = binaryName + (isWin ? '.exe' : '');

    // 1. Check bundled bin folder (Prioritize bundled versions)
    const bundledPath = path.join(getBinDir(), fullName);
    if (fs.existsSync(bundledPath)) return bundledPath;

    // 2. Check system PATH
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

function getBinaryPath(binaryName) {
    const found = findBinary(binaryName);
    if (found) return found;
    return binaryName;
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

// Single instance lock - prevent multiple hidden processes
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
        createWindow();

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
    const binaryPath = findBinary(binaryName);

    if (!binaryPath) {
        mainWindow.webContents.send('download-error', `Engine ${binaryName} not found! This indicates a broken installation.`);
        return;
    }

    const binDir = getBinDir();
    const pathSeparator = isWin ? ';' : ':';
    const systemPaths = isWin
        ? `${process.env.PATH || ''}`
        : `/usr/bin:/usr/local/bin:/bin:${process.env.PATH || ''}`;

    const spawnEnv = {
        ...process.env,
        PATH: `${binDir}${pathSeparator}${systemPaths}`,
        PYTHONIOENCODING: 'utf-8',
        LC_ALL: 'en_US.UTF-8'
    };

    const ffmpegPath = getBinaryPath('ffmpeg');
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
        console.error("Failed to start yt-dlp binary:", err);
        mainWindow.webContents.send('download-error', `Failed to start engine: ${err.message}\nPath: ${binaryPath}`);
    });

    ydl.stdout.on('data', (data) => {
        const output = data.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%\s+of\s+~?\s*([\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)/);

        if (progressMatch) {
            const [_, percent, size, speed, eta] = progressMatch;
            mainWindow.webContents.send('download-progress', {
                type: 'progress',
                data: {
                    percent: parseFloat(percent),
                    speed,
                    eta
                }
            });
        } else if (output.includes('[Merger]')) {
            mainWindow.webContents.send('download-progress', { type: 'status', data: 'Merging files...' });
        } else if (output.includes('[EmbedSubtitle]')) {
            mainWindow.webContents.send('download-progress', { type: 'status', data: 'Embedding subtitles...' });
        }
    });

    ydl.stderr.on('data', (data) => {
        errorLog += data.toString();
    });

    ydl.on('close', (code) => {
        console.log(`yt-dlp closed with code: ${code}`);
        if (code === 0) {
            mainWindow.webContents.send('download-progress', { type: 'complete', data: 'Success' });
        } else {
            const finalError = errorLog.trim() || `Process exited with code ${code}`;
            mainWindow.webContents.send('download-progress', { type: 'error', data: finalError });
        }
    });
});

ipcMain.on('window-control', (event, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'close') mainWindow.close();
});
