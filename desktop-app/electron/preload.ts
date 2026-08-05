import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dreamSkin', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  action: (name: string, values: string[] = []) => ipcRenderer.invoke('action', name, values),
  chooseImage: () => ipcRenderer.invoke('choose-image'),
  openStateFolder: () => ipcRenderer.invoke('open-state-folder'),
})

contextBridge.exposeInMainWorld('electronAPI', {
  getOpenApiEnv: () => ipcRenderer.invoke('env:getOpenApi'),
  selectDirectory: (defaultPath?: string) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
  saveFile: (options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => ipcRenderer.invoke('dialog:saveFile', options),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  writeFiles: (items: Array<{ path: string; content: string }>) => ipcRenderer.invoke('fs:writeFiles', items),
  saveEnv: (items: Array<{ key: string; value: string; description?: string }>) => ipcRenderer.invoke('env:save', items),
  loadEnv: () => ipcRenderer.invoke('env:load'),
  resetEnv: () => ipcRenderer.invoke('env:reset'),
  saveToken: (token: string) => ipcRenderer.invoke('token:save', token),
  loadToken: () => ipcRenderer.invoke('token:load'),
  clearToken: () => ipcRenderer.invoke('token:clear'),
  openPath: (value: string) => ipcRenderer.invoke('shell:openPath', value),
})
