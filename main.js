const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');

app.disableHardwareAcceleration();

let mainWindow;

// Binary download configuration
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

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading: ${url}`);
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
                const file = fs.createWriteStream(destPath);
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(destPath); });
                file.on('error', reject);
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

function isFFmpegInstalled() {
    try {
        const isWin = process.platform === 'win32';
        if (isWin) {
            execSync('where ffmpeg', { stdio: 'ignore' });
        } else {
            execSync('which ffmpeg', { stdio: 'ignore' });
        }
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get the path to a bundled binary (ffmpeg, ffprobe, phantomjs)
 * Works in both development and packaged mode, on Windows and Linux
 */
function getBinaryPath(binaryName) {
    const isWin = process.platform === 'win32';
    const ext = isWin ? '.exe' : '';
    const fullName = binaryName + ext;

    let binDir;
    if (app.isPackaged) {
        binDir = path.join(process.resourcesPath, 'bin');
    } else {
        binDir = path.join(__dirname, 'bin');
    }

    const binaryPath = path.join(binDir, fullName);

    // Check if bundled binary exists
    if (fs.existsSync(binaryPath)) {
        console.log(`Using bundled ${binaryName}: ${binaryPath}`);
        return binaryPath;
    }

    // Fallback: try system PATH
    console.log(`Bundled ${binaryName} not found, using system PATH`);
    return binaryName;
}

async function installFFmpeg() {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';

        let installCommand;
        let shell = true;

        if (isWin) {
            installCommand = 'winget install --id=Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements';
        } else {
            const packageManagers = [
                { check: 'apt', install: 'sudo apt update && sudo apt install -y ffmpeg' },
                { check: 'dnf', install: 'sudo dnf install -y ffmpeg' },
                { check: 'pacman', install: 'sudo pacman -S --noconfirm ffmpeg' },
                { check: 'zypper', install: 'sudo zypper install -y ffmpeg' },
                { check: 'apk', install: 'sudo apk add ffmpeg' }
            ];

            for (const pm of packageManagers) {
                try {
                    execSync(`which ${pm.check}`, { stdio: 'ignore' });
                    installCommand = pm.install;
                    break;
                } catch (e) {
                }
            }

            if (!installCommand) {
                resolve({
                    success: false,
                    message: 'Could not detect package manager. Please install ffmpeg manually.'
                });
                return;
            }
        }

        console.log(`Installing ffmpeg with command: ${installCommand}`);

        exec(installCommand, { shell }, (error, stdout, stderr) => {
            if (error) {
                console.error('FFmpeg installation error:', error);
                console.error('stderr:', stderr);
                resolve({
                    success: false,
                    message: `Installation failed: ${error.message}\n\nPlease install ffmpeg manually.`
                });
            } else {
                console.log('FFmpeg installed successfully');
                resolve({
                    success: true,
                    message: 'FFmpeg installed successfully!'
                });
            }
        });
    });
}

async function checkAndInstallFFmpeg() {
    if (isFFmpegInstalled()) {
        console.log('FFmpeg is already installed');
        return;
    }

    console.log('FFmpeg not found, attempting to install...');

    const response = await dialog.showMessageBox({
        type: 'info',
        title: 'FFmpeg Required',
        message: 'FFmpeg is required but not installed.',
        detail: 'FFmpeg is needed for video processing. Would you like to install it now?',
        buttons: ['Install', 'Cancel'],
        defaultId: 0,
        cancelId: 1
    });

    if (response.response === 1) {
        await dialog.showMessageBox({
            type: 'warning',
            title: 'FFmpeg Not Installed',
            message: 'Some features may not work without FFmpeg.',
            buttons: ['OK']
        });
        return;
    }

    const installResult = await installFFmpeg();

    if (installResult.success) {
        await dialog.showMessageBox({
            type: 'info',
            title: 'Installation Complete',
            message: installResult.message,
            buttons: ['OK']
        });
    } else {
        await dialog.showMessageBox({
            type: 'error',
            title: 'Installation Failed',
            message: installResult.message,
            detail: getManualInstallInstructions(),
            buttons: ['OK']
        });
    }
}

function getManualInstallInstructions() {
    const isWin = process.platform === 'win32';

    if (isWin) {
        return 'Windows Installation:\n' +
            '1. Download from https://ffmpeg.org/download.html\n' +
            '2. Or use: winget install ffmpeg\n' +
            '3. Or use: choco install ffmpeg';
    } else {
        return 'Linux Installation:\n' +
            '• Ubuntu/Debian: sudo apt install ffmpeg\n' +
            '• Fedora: sudo dnf install ffmpeg\n' +
            '• Arch: sudo pacman -S ffmpeg';
    }
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
}

app.whenReady().then(async () => {
    // Auto-download binaries on first launch
    await downloadBinariesIfNeeded();

    await checkAndInstallFFmpeg();

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

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
    const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp-linux';

    let binaryPath = path.join(__dirname, 'bin', binaryName);
    if (app.isPackaged) {
        binaryPath = path.join(process.resourcesPath, 'bin', binaryName);
    }

    // Get bin directory for PATH
    let binDir;
    if (app.isPackaged) {
        binDir = path.join(process.resourcesPath, 'bin');
    } else {
        binDir = path.join(__dirname, 'bin');
    }

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

    // Get bundled binary paths
    const ffmpegPath = getBinaryPath('ffmpeg');
    const phantomjsPath = getBinaryPath('phantomjs');

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

    // Add JS runtime if phantomjs is available
    if (fs.existsSync(phantomjsPath)) {
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
