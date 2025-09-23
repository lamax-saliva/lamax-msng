const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let mainWindow;
let loginWindow;

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 500,
        height: 650,
        icon: path.join(__dirname, "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    loginWindow.setMenu(null);
    loginWindow.loadFile("Login.html");
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.setMenu(null);
    mainWindow.loadFile("MainWindow.html");
}

// события от фронта
ipcMain.on("login-success", () => {
    if (loginWindow) {
        loginWindow.close();
        loginWindow = null;
    }
    createMainWindow();
});

ipcMain.on("logout", () => {
    if (mainWindow) {
        mainWindow.close();
        mainWindow = null;
    }
    createLoginWindow();
});

app.whenReady().then(() => {
    createLoginWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createLoginWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
