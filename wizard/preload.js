const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  loadChoices: () => ipcRenderer.invoke('load-choices'),
  saveChoices: (c) => ipcRenderer.invoke('save-choices', c),
  check: (o) => ipcRenderer.invoke('check', o),
  checkPort: (o) => ipcRenderer.invoke('check-port', o),
  install: (o) => ipcRenderer.invoke('install', o),
  cancel: () => ipcRenderer.invoke('cancel'),
  openUrl: (u) => ipcRenderer.invoke('open-url', u),
  onProgress: (fn) => ipcRenderer.on('progress', (_e, p) => fn(p)),
});
