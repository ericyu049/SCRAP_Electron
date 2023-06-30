const { app, BrowserWindow } = require('electron');
function createWindow() {
    win = new BrowserWindow({
        width: 1000, 
        height: 800, 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('./dist/scrap-electron/index.html');
    win.webContents.openDevTools();
}
app.whenReady().then(() => {
    createWindow()
})