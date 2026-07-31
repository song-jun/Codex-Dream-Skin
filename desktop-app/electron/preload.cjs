const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dreamSkin', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  action: (name, values = []) => ipcRenderer.invoke('action', name, values),
  chooseImage: () => ipcRenderer.invoke('choose-image'),
  openStateFolder: () => ipcRenderer.invoke('open-state-folder'),
  confirmRestore: () => ipcRenderer.invoke('confirm-restore'),
})
