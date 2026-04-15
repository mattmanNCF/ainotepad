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
      tags: string[]
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
    ipcRenderer.on('note:aiUpdate', handler)
    return () => ipcRenderer.removeListener('note:aiUpdate', handler)
  },
  settings: {
    save: (key: string, provider: string) =>
      ipcRenderer.invoke('settings:save', { key, provider }),
    get: (): Promise<{ provider: string; hasKey: boolean }> =>
      ipcRenderer.invoke('settings:get'),
  },
  kb: {
    listFiles: (): Promise<string[]> => ipcRenderer.invoke('kb:listFiles'),
    readFile: (filename: string): Promise<string | null> => ipcRenderer.invoke('kb:readFile', filename),
    getTagColors: (): Promise<Record<string, string>> => ipcRenderer.invoke('kb:getTagColors'),
    setTagColor: (tag: string, color: string): Promise<void> => ipcRenderer.invoke('kb:setTagColor', tag, color),
    onUpdated: (cb: () => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent) => cb()
      ipcRenderer.on('kb:updated', handler)
      return () => ipcRenderer.removeListener('kb:updated', handler)
    },
  },
})
