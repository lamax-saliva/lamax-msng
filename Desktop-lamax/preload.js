const { contextBridge, ipcRenderer } = require("electron");
const io = require("socket.io-client");

contextBridge.exposeInMainWorld("electronAPI", {
    createSocket: (url = "http://193.233.86.5:4000") => {
        return io(url, {
            autoConnect: true,
        });
    },
    redirectToLogin: () => { window.location.href = "login.html"; },
    redirectToMain: () => { window.location.href = "mainwindow.html"; },
    loginSuccess: () => ipcRenderer.send("login-success"),
    logout: () => ipcRenderer.send("logout"),
    getUsers: () => ipcRenderer.invoke("get-users")
});
