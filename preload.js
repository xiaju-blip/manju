const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ipcInvoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
