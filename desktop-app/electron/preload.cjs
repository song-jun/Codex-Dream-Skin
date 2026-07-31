const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dreamSkin', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  action: (name, values = []) => ipcRenderer.invoke('action', name, values),
  chooseImage: () => ipcRenderer.invoke('choose-image'),
  previewImage: (imagePath) => ipcRenderer.invoke('preview-image', imagePath),
  openStateFolder: () => ipcRenderer.invoke('open-state-folder'),
})
