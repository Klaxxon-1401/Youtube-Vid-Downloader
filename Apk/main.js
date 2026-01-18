const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 600,
        minWidth: 500,
        minHeight: 500,
        frame: false, // Custom frame
        backgroundColor: '#121212',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // For simplicity in this local tool, or use preload
        },
        icon: path.join(__dirname, 'youtube_logo.png')
    });

    mainWindow.loadFile('src/index.html');
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
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

// IPC Handlers
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

ipcMain.on('download-video', (event, { url, savePath }) => {
    const pythonScript = path.join(__dirname, 'py_handler.py');

    // Clean up path for Windows/Linux compatibility if needed, but Node handles it well

    const pyProcess = spawn('python', [pythonScript]);

    // Send data to Python script via stdin
    const inputData = JSON.stringify({ url, path: savePath });
    pyProcess.stdin.write(inputData);
    pyProcess.stdin.end();

    pyProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const json = JSON.parse(line);
                    mainWindow.webContents.send('download-progress', json);
                } catch (e) {
                    // console.log("Raw output:", line);
                }
            }
        });
    });

    pyProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
        mainWindow.webContents.send('download-error', data.toString());
    });

    pyProcess.on('close', (code) => {
        if (code !== 0) {
            mainWindow.webContents.send('download-error', `Process exited with code ${code}`);
        }
    });
});

ipcMain.on('window-control', (event, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'close') mainWindow.close();
});
