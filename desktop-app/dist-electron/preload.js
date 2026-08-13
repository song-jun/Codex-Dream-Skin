import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('dreamSkin', {
    snapshot: () => ipcRenderer.invoke('snapshot'),
    action: (name, values = []) => ipcRenderer.invoke('action', name, values),
    chooseImage: () => ipcRenderer.invoke('choose-image'),
    openStateFolder: () => ipcRenderer.invoke('open-state-folder'),
});
contextBridge.exposeInMainWorld('electronAPI', {
    getOpenApiEnv: () => ipcRenderer.invoke('env:getOpenApi'),
    fetchJson: (url) => ipcRenderer.invoke('api:fetchJson', url),
    selectDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    writeFiles: (items) => ipcRenderer.invoke('fs:writeFiles', items),
    saveEnv: (items) => ipcRenderer.invoke('env:save', items),
    loadEnv: () => ipcRenderer.invoke('env:load'),
    resetEnv: () => ipcRenderer.invoke('env:reset'),
    saveToken: (token) => ipcRenderer.invoke('token:save', token),
    loadToken: () => ipcRenderer.invoke('token:load'),
    clearToken: () => ipcRenderer.invoke('token:clear'),
    openPath: (value) => ipcRenderer.invoke('shell:openPath', value),
});
