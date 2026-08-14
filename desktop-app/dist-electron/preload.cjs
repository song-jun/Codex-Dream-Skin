const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dreamSkin', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  action: (name, values = []) => ipcRenderer.invoke('action', name, values),
  chooseImage: () => ipcRenderer.invoke('choose-image'),
  previewImage: (imagePath) => ipcRenderer.invoke('preview-image', imagePath),
  openStateFolder: () => ipcRenderer.invoke('open-state-folder'),
  activateFeature: (key) => ipcRenderer.invoke('activate-feature', key),
  deactivateFeature: () => ipcRenderer.invoke('deactivate-feature'),
  onFeatureCommand: (listener) => {
    const handler = (_event, category) => listener(category)
    ipcRenderer.on('feature-command', handler)
    return () => ipcRenderer.removeListener('feature-command', handler)
  },
})

contextBridge.exposeInMainWorld('electronAPI', {
  getOpenApiEnv: () => ipcRenderer.invoke('env:getOpenApi'),
  fetchJson: (url) => ipcRenderer.invoke('api:fetchJson', url),
  requestApi: (request) => ipcRenderer.invoke('api:request', request),
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
})
