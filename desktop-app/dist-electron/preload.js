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
    requestApi: (request) => ipcRenderer.invoke('api:request', request),
    recognizeSprite: (dataUrl) => ipcRenderer.invoke('sprite:recognize', dataUrl),
    selectDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
    selectSpriteFiles: (mode) => ipcRenderer.invoke('dialog:selectSpriteFiles', mode),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    writeFiles: (items) => ipcRenderer.invoke('fs:writeFiles', items),
    writeBinaryFile: (filePath, base64) => ipcRenderer.invoke('fs:writeBinaryFile', filePath, base64),
    saveEnv: (items) => ipcRenderer.invoke('env:save', items),
    loadEnv: () => ipcRenderer.invoke('env:load'),
    resetEnv: () => ipcRenderer.invoke('env:reset'),
    saveToken: (token) => ipcRenderer.invoke('token:save', token),
    loadToken: () => ipcRenderer.invoke('token:load'),
    clearToken: () => ipcRenderer.invoke('token:clear'),
    openPath: (value) => ipcRenderer.invoke('shell:openPath', value),
});
