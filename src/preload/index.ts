import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    create: (rawText: string) => ipcRenderer.invoke('notes:create', rawText),
  },
  onAiUpdate: (
    cb: (data: {
      noteId: string
      aiState: string
      aiAnnotation: string | null
      organizedText: string | null
    }) => void
  ) => {
    ipcRenderer.on('note:aiUpdate', (_event, data) => cb(data))
  },
  settings: {
    save: (key: string, provider: string) =>
      ipcRenderer.invoke('settings:save', { key, provider }),
    get: (): Promise<{ provider: string; hasKey: boolean }> =>
      ipcRenderer.invoke('settings:get'),
  },
})
