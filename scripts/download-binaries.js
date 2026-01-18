#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');

const BINARIES = {
    linux: {
        ffmpeg: {
            url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
            type: 'tar.xz',
            files: ['ffmpeg', 'ffprobe']
        },
        yt_dlp: {
            url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
            type: 'binary',
            files: ['yt-dlp-linux']
        },
        phantomjs: {
            url: 'https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-linux-x86_64.tar.bz2',
            type: 'tar.bz2',
            files: ['phantomjs']
        }
    },
    win32: {
        ffmpeg: {
            url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
            type: 'zip',
            files: ['ffmpeg.exe', 'ffprobe.exe']
        },
        yt_dlp: {
            url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
            type: 'binary',
            files: ['yt-dlp.exe']
        },
        phantomjs: {
            url: 'https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-windows.zip',
            type: 'zip',
            files: ['phantomjs.exe']
        }
    }
};

if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading: ${url}`);

        const protocol = url.startsWith('https') ? https : http;

        const request = (currentUrl) => {
            protocol.get(currentUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    console.log(`Redirecting to: ${response.headers.location}`);
                    request(response.headers.location);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(destPath);
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    console.log(`Downloaded to: ${destPath}`);
                    resolve(destPath);
                });

                file.on('error', (err) => {
                    fs.unlink(destPath, () => { });
                    reject(err);
                });
            }).on('error', reject);
        };

        request(url);
    });
}

function extractArchive(archivePath, destDir, type) {
    console.log(`Extracting: ${archivePath}`);

    const isWin = process.platform === 'win32';

    try {
        if (type === 'zip') {
            if (isWin) {
                execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
            } else {
                execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'inherit' });
            }
            fs.unlinkSync(archivePath);
        } else if (type === 'tar.xz') {
            execSync(`tar -xJf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
            fs.unlinkSync(archivePath);
        } else if (type === 'tar.bz2') {
            execSync(`tar -xjf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
            fs.unlinkSync(archivePath);
        } else if (type === 'binary') {
            if (!isWin) {
                fs.chmodSync(archivePath, 0o755);
            }
        }
        console.log(`Processed: ${archivePath}`);
    } catch (err) {
        console.error(`Failed to extract ${archivePath}:`, err.message);
        throw err;
    }
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

            if (process.platform !== 'win32') {
                fs.chmodSync(destPath, 0o755);
            }

            console.log(`Copied: ${binaryName} -> ${destPath}`);
            return destPath;
        }
    }

    return null;
}

function cleanupExtractedDirs(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        if (file.isDirectory()) {
            const fullPath = path.join(dir, file.name);
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`Cleaned up: ${fullPath}`);
        }
    }
}

function checkBinaryExists(binaryName) {
    const binaryPath = path.join(BIN_DIR, binaryName);
    return fs.existsSync(binaryPath);
}

async function downloadBinaries() {
    // Force win32 for the binaries we want to bundle, as requested
    const platform = 'win32';
    const platformBinaries = BINARIES[platform];

    if (!platformBinaries) {
        console.error(`Unsupported platform: ${platform}`);
        process.exit(1);
    }

    console.log(`\n=== Forcing download of ${platform} binaries for bundling ===\n`);

    // Download directly into bin/win32 to segregate sources
    const targetDir = path.join(BIN_DIR, platform);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const [name, config] of Object.entries(platformBinaries)) {
        const allExist = config.files.every(f => fs.existsSync(path.join(targetDir, f)));

        if (allExist) {
            console.log(`✓ ${name} binaries already exist in ${targetDir}, skipping...`);
            continue;
        }

        console.log(`\n--- Downloading ${name} ---`);

        const archiveExt = config.type === 'binary' ? '' : '.zip';
        let archiveName = `${name}${archiveExt}`;
        if (config.type === 'binary') {
            archiveName = config.files[0];
        }
        const archivePath = path.join(targetDir, archiveName);

        try {
            await downloadFile(config.url, archivePath);

            if (config.type !== 'binary') {
                extractArchive(archivePath, targetDir, config.type);

                for (const binaryName of config.files) {
                    if (!fs.existsSync(path.join(targetDir, binaryName))) {
                        findAndCopyBinary(targetDir, binaryName, targetDir);
                    }
                }
                cleanupExtractedDirs(targetDir);
            }

            console.log(`✓ ${name} processed successfully`);
        } catch (err) {
            console.error(`✗ Failed to download ${name}:`, err.message);
        }
    }

    console.log(`\n=== Binary download complete for ${platform} ===\n`);
}

downloadBinaries().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
