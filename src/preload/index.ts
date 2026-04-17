import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    create: (rawText: string) => ipcRenderer.invoke('notes:create', rawText),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    hide: (id: string) => ipcRenderer.invoke('notes:hide', id),
    reprocess: (id: string) => ipcRenderer.invoke('notes:reprocess', id),
  },
  onAiUpdate: (
    cb: (data: {
      noteId: string
      aiState: string
      aiAnnotation: string | null
      organizedText: string | null
      tags: string[]
      insights: string | null
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
    ipcRenderer.on('note:aiUpdate', handler)
    return () => ipcRenderer.removeListener('note:aiUpdate', handler)
  },
  settings: {
    save: (key: string, provider: string, ollamaModel?: string, braveKey?: string) =>
      ipcRenderer.invoke('settings:save', { key, provider, ollamaModel, braveKey }),
    get: (): Promise<{ provider: string; hasKey: boolean; ollamaModel: string; hasBraveKey: boolean; modelTier: string }> =>
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
  localModel: {
    getStatus: (): Promise<{ tier: string; modelPath: string | null; ready: boolean }> =>
      ipcRenderer.invoke('localModel:getStatus'),
  },
  digest: {
    getLatest: (period: string): Promise<any> => ipcRenderer.invoke('digests:getLatest', period),
    onUpdated: (cb: (data: { period: string; periodStart: string; narrative: string; stats: string; wordCloudData: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('digest:updated', handler)
      return () => ipcRenderer.removeListener('digest:updated', handler)
    },
  },
})
