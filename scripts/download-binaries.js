#!/usr/bin/env node

/**
 * Cross-platform script to download FFmpeg and PhantomJS binaries
 * Works on both Windows and Linux
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// BIN_DIR is the project's bin folder (parent of scripts folder)
const BIN_DIR = path.join(__dirname, '..', 'bin');

// Binary download URLs
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

// Ensure bin directory exists
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
                // Handle redirects
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
                // Use PowerShell on Windows
                execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
            } else {
                execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'inherit' });
            }
        } else if (type === 'tar.xz') {
            execSync(`tar -xJf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
        } else if (type === 'tar.bz2') {
            execSync(`tar -xjf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
        }

        // Clean up archive
        fs.unlinkSync(archivePath);
        console.log(`Extracted and cleaned up: ${archivePath}`);
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

            // Make executable on Linux
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
    const platform = process.platform;
    const platformBinaries = BINARIES[platform];

    if (!platformBinaries) {
        console.error(`Unsupported platform: ${platform}`);
        console.log('Supported platforms: linux, win32');
        process.exit(1);
    }

    console.log(`\n=== Downloading binaries for ${platform} ===\n`);

    for (const [name, config] of Object.entries(platformBinaries)) {
        // Check if all binaries already exist
        const allExist = config.files.every(f => checkBinaryExists(f));

        if (allExist) {
            console.log(`✓ ${name} binaries already exist, skipping...`);
            continue;
        }

        console.log(`\n--- Downloading ${name} ---`);

        const archiveExt = config.type === 'tar.xz' ? '.tar.xz' :
            config.type === 'tar.bz2' ? '.tar.bz2' : '.zip';
        const archivePath = path.join(BIN_DIR, `${name}${archiveExt}`);

        try {
            let downloaded = false;
            let downloadError = null;

            // Try primary URL first
            try {
                await downloadFile(config.url, archivePath);
                downloaded = true;
            } catch (err) {
                downloadError = err;
                console.log(`Primary URL failed: ${err.message}`);

                // Try alternate URL if available
                if (config.altUrl) {
                    console.log(`Trying alternate URL...`);
                    try {
                        await downloadFile(config.altUrl, archivePath);
                        downloaded = true;
                    } catch (altErr) {
                        console.log(`Alternate URL also failed: ${altErr.message}`);
                    }
                }
            }

            if (!downloaded) {
                throw downloadError || new Error('All download URLs failed');
            }

            extractArchive(archivePath, BIN_DIR, config.type);

            // Find and copy the binaries to bin root
            for (const binaryName of config.files) {
                if (!checkBinaryExists(binaryName)) {
                    const found = findAndCopyBinary(BIN_DIR, binaryName, BIN_DIR);
                    if (!found) {
                        console.warn(`Warning: Could not find ${binaryName} in extracted archive`);
                    }
                }
            }

            // Clean up extracted directories
            cleanupExtractedDirs(BIN_DIR);

            console.log(`✓ ${name} downloaded and extracted successfully`);
        } catch (err) {
            console.error(`✗ Failed to download ${name}:`, err.message);
            console.log(`  You may need to download ${name} manually.`);
        }
    }

    console.log('\n=== Binary download complete ===\n');

    // List binaries in bin directory
    console.log('Binaries in bin/:');
    const binFiles = fs.readdirSync(BIN_DIR).filter(f => {
        const stat = fs.statSync(path.join(BIN_DIR, f));
        return stat.isFile();
    });
    binFiles.forEach(f => console.log(`  - ${f}`));
}

// Run the download
downloadBinaries().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
