const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');

app.disableHardwareAcceleration();

let mainWindow;

const BINARIES = {
    linux: {
        ffmpeg: {
            url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
            type: 'tar.xz',
            files: ['ffmpeg', 'ffprobe']
        },
        phantomjs: {
            url: 'https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-linux-x86_64.tar.bz2',
            type: 'tar.bz2',
            files: ['phantomjs']
        }
    },
    win32: {
        ffmpeg: {
            url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
            type: 'zip',
            files: ['ffmpeg.exe', 'ffprobe.exe']
        },
        phantomjs: {
            url: 'https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-windows.zip',
            type: 'zip',
            files: ['phantomjs.exe']
        }
    }
};

function getBinDir() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin');
    }
    return path.join(__dirname, 'bin');
}

function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = (currentUrl) => {
            const proto = currentUrl.startsWith('https') ? https : http;
            proto.get(currentUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    request(response.headers.location);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const totalBytes = parseInt(response.headers['content-length'], 10);
                let downloadedBytes = 0;
                let startTime = Date.now();

                const file = fs.createWriteStream(destPath);
                response.pipe(file);

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (onProgress && totalBytes) {
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = downloadedBytes / elapsed; // bytes per second
                        const remainingBytes = totalBytes - downloadedBytes;
                        const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;
                        const percent = (downloadedBytes / totalBytes) * 100;

                        onProgress({
                            percent,
                            speed,
                            eta,
                            status: 'Downloading...'
                        });
                    }
                });

                file.on('finish', () => { file.close(); resolve(destPath); });
                file.on('error', (err) => { fs.unlink(destPath, () => { }); reject(err); });
            }).on('error', reject);
        };
        request(url);
    });
}

function extractArchive(archivePath, destDir, type) {
    const isWin = process.platform === 'win32';
    if (type === 'zip') {
        if (isWin) {
            execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' });
        } else {
            execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'pipe' });
        }
    } else if (type === 'tar.xz') {
        execSync(`tar -xJf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe' });
    } else if (type === 'tar.bz2') {
        execSync(`tar -xjf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe' });
    }
    fs.unlinkSync(archivePath);
}

function findAndCopyBinary(searchDir, binaryName, destDir) {
    const files = fs.readdirSync(searchDir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(searchDir, file.name);
        if (file.isDirectory()) {
            const found = findAndCopyBinary(fullPath, binaryName, destDir);
            if (found) return found;
        } else if (file.name === binaryName) {
            const destPath = path.join(destDir, binaryName);
            fs.copyFileSync(fullPath, destPath);
            if (process.platform !== 'win32') fs.chmodSync(destPath, 0o755);
            return destPath;
        }
    }
    return null;
}

function cleanupExtractedDirs(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            fs.rmSync(path.join(dir, file.name), { recursive: true, force: true });
        }
    }
}

async function downloadBinariesIfNeeded() {
    const platform = process.platform;
    const platformBinaries = BINARIES[platform];
    if (!platformBinaries) return;

    const binDir = getBinDir();
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    for (const [name, config] of Object.entries(platformBinaries)) {
        const allExist = config.files.every(f => fs.existsSync(path.join(binDir, f)));
        if (allExist) {
            console.log(`✓ ${name} binaries already present`);
            continue;
        }

        console.log(`Downloading ${name}...`);
        const archiveExt = config.type === 'tar.xz' ? '.tar.xz' :
            config.type === 'tar.bz2' ? '.tar.bz2' : '.zip';
        const archivePath = path.join(binDir, `${name}${archiveExt}`);

        try {
            await downloadFile(config.url, archivePath);
            extractArchive(archivePath, binDir, config.type);

            for (const binaryName of config.files) {
                if (!fs.existsSync(path.join(binDir, binaryName))) {
                    findAndCopyBinary(binDir, binaryName, binDir);
                }
            }
            cleanupExtractedDirs(binDir);
            console.log(`✓ ${name} downloaded successfully`);
        } catch (err) {
            console.error(`Failed to download ${name}:`, err.message);
        }
    }
}

// Checks if a binary exists in system PATH or bundled bin folder
function findBinary(binaryName) {
    const isWin = process.platform === 'win32';
    const fullName = binaryName + (isWin ? '.exe' : '');

    // 1. Check bundled bin folder
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
    if (found) {
        console.log(`Using ${binaryName}: ${found}`);
        return found;
    }
    console.log(`${binaryName} not found, returning default name`);
    return binaryName;
}

async function checkBinaryStatus() {
    const isWin = process.platform === 'win32';
    const ffmpeg = findBinary('ffmpeg');
    const phantomjs = findBinary('phantomjs');
    const ytdlp = findBinary(isWin ? 'yt-dlp' : 'yt-dlp-linux');

    return {
        ready: !!(ffmpeg && ytdlp),
        missing: {
            ffmpeg: !ffmpeg,
            phantomjs: !phantomjs,
            ytdlp: !ytdlp
        }
    };
}

let setupInProgress = false;

async function runSetup(window) {
    if (setupInProgress) return;
    setupInProgress = true;

    const binDir = getBinDir();
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    const platform = process.platform;
    const platformBinaries = BINARIES[platform];
    if (!platformBinaries) {
        window.webContents.send('setup-progress', { status: 'error', message: 'Unsupported platform' });
        setupInProgress = false;
        return;
    }

    const steps = Object.entries(platformBinaries);
    let completedSteps = 0;

    for (const [name, config] of steps) {
        // Check if this specific one is missing
        const existing = config.files.every(f => {
            const fileName = f.replace('.exe', '');
            return fs.existsSync(path.join(binDir, f)) || findBinary(fileName);
        });

        if (existing) {
            completedSteps++;
            window.webContents.send('setup-progress', {
                percent: (completedSteps / steps.length) * 100,
                status: `✓ ${name} ready`
            });
            continue;
        }

        try {
            await downloadFile(config.url, archivePath, (p) => {
                // Adjust percent to be step-relative
                const stepBase = (completedSteps / steps.length) * 100;
                const stepWeight = (1 / steps.length) * 0.8; // Give extraction some weight too
                const totalPercent = stepBase + (p.percent * stepWeight);

                window.webContents.send('setup-progress', {
                    percent: totalPercent,
                    status: `Downloading ${name}...`,
                    eta: p.eta,
                    speed: p.speed
                });
            });

            window.webContents.send('setup-progress', {
                percent: ((completedSteps + 0.8) / steps.length) * 100,
                status: `Extracting ${name}...`
            });

            extractArchive(archivePath, binDir, config.type);

            for (const binaryName of config.files) {
                if (!fs.existsSync(path.join(binDir, binaryName))) {
                    findAndCopyBinary(binDir, binaryName, binDir);
                }
            }
            cleanupExtractedDirs(binDir);

            completedSteps++;
            window.webContents.send('setup-progress', {
                percent: (completedSteps / steps.length) * 100,
                status: `✓ ${name} installed`
            });
        } catch (err) {
            console.error(`Failed to setup ${name}:`, err);
            window.webContents.send('setup-progress', { status: 'error', message: `Failed to download ${name}` });
            setupInProgress = false;
            return;
        }
    }

    setupInProgress = false;
    window.webContents.send('setup-progress', { percent: 100, status: 'complete' });
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
        icon: path.join(__dirname, 'youtube_logo.png')
    });

    mainWindow.loadFile('src/index.html');

    // Check status once window is ready to report
    mainWindow.webContents.on('did-finish-load', async () => {
        const status = await checkBinaryStatus();
        if (!status.ready) {
            mainWindow.webContents.send('setup-required', status.missing);
        } else {
            mainWindow.webContents.send('setup-progress', { status: 'complete' });
        }
    });
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

ipcMain.on('start-setup', () => {
    runSetup(mainWindow);
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
        mainWindow.webContents.send('download-error', `Engine ${binaryName} not found! Please run setup.`);
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
