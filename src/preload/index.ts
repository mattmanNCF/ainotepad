import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    create: (rawText: string) => ipcRenderer.invoke('notes:create', rawText),
  }
})
