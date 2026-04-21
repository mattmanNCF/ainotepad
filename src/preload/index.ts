import { contextBridge, ipcRenderer } from 'electron'
import type { GraphParams } from '../renderer/src/types/graphParams'

contextBridge.exposeInMainWorld('api', {
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    create: (rawText: string) => ipcRenderer.invoke('notes:create', rawText),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    hide: (id: string) => ipcRenderer.invoke('notes:hide', id),
    reprocess: (id: string) => ipcRenderer.invoke('notes:reprocess', id),
    allTags: (): Promise<string[][]> => ipcRenderer.invoke('notes:allTags'),
    recentInsights: (): Promise<Array<{ id: string; tags: string; aiInsights: string; submittedAt: string }>> =>
      ipcRenderer.invoke('notes:recentInsights'),
    getSimilarPairs: (): Promise<Array<{ a: string; b: string }>> =>
      ipcRenderer.invoke('notes:getSimilarPairs'),
  },
  onAiUpdate: (
    cb: (data: {
      noteId: string
      aiState: string
      aiAnnotation: string | null
      organizedText: string | null
      tags: string[]
      insights: string | null
      reminder: { text: string; date_text: string; confidence: number } | null
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
    ipcRenderer.on('note:aiUpdate', handler)
    return () => ipcRenderer.removeListener('note:aiUpdate', handler)
  },
  settings: {
    save: (key: string, provider: string, ollamaModel?: string, llamaCppPath?: string) =>
      ipcRenderer.invoke('settings:save', { key, provider, ollamaModel, llamaCppPath }),
    get: (): Promise<{
      provider: string
      hasKey: boolean
      ollamaModel: string
      modelTier: string
      llamaCppPath: string
      keyStatus: Record<string, boolean>
    }> => ipcRenderer.invoke('settings:get'),
    listOllamaModels: (): Promise<string[]> => ipcRenderer.invoke('settings:list-ollama-models'),
  },
  kb: {
    listFiles: (): Promise<string[]> => ipcRenderer.invoke('kb:listFiles'),
    readFile: (filename: string): Promise<string | null> => ipcRenderer.invoke('kb:readFile', filename),
    getTagColors: (): Promise<Record<string, string>> => ipcRenderer.invoke('kb:getTagColors'),
    setTagColor: (tag: string, color: string): Promise<void> => ipcRenderer.invoke('kb:setTagColor', tag, color),
    deleteFile: (filename: string): Promise<void> => ipcRenderer.invoke('kb:deleteFile', filename),
    onUpdated: (cb: () => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent) => cb()
      ipcRenderer.on('kb:updated', handler)
      return () => ipcRenderer.removeListener('kb:updated', handler)
    },
  },
  graphParams: {
    get: (): Promise<GraphParams> => ipcRenderer.invoke('graph-params:get'),
    save: (params: GraphParams): Promise<void> => ipcRenderer.invoke('graph-params:save', params),
  },
  calendar: {
    getStatus: (): Promise<{
      connected: boolean
      lastSuccess: string | null
      encryptionAvailable: boolean
      confirmBeforeCreate: boolean
    }> => ipcRenderer.invoke('calendar:getStatus'),
    connect: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('calendar:connect'),
    disconnect: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('calendar:disconnect'),
    setConfirmBeforeCreate: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('calendar:setConfirmBeforeCreate', value),
    openLink: (url: string): Promise<void> => ipcRenderer.invoke('calendar:openLink', url),
    undoCreate: (reminderId: string): Promise<void> => ipcRenderer.invoke('calendar:undoCreate', reminderId),
    confirmCreate: (reminderId: string): Promise<void> => ipcRenderer.invoke('calendar:confirmCreate', reminderId),
    needsDeleteConfirm: (noteId: string): Promise<boolean> =>
      ipcRenderer.invoke('calendar:needsDeleteConfirm', noteId),
    setDontAskDeleteCalEvent: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('calendar:setDontAskDeleteCalEvent', value),
    getDontAskDeleteCalEvent: (): Promise<boolean> =>
      ipcRenderer.invoke('calendar:getDontAskDeleteCalEvent'),
    onEventPending: (cb: (data: {
      noteId: string
      reminderId: string
      eventTitle: string
      timestampUtc: string
      originalTz: string
      mode: 'auto' | 'confirm'
      undoDeadlineMs: number
    }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('calendar:eventPending', handler)
      return () => ipcRenderer.removeListener('calendar:eventPending', handler)
    },
    onEventSynced: (cb: (data: {
      noteId: string
      reminderId: string
      eventId: string
      eventTitle: string
      timestampUtc: string
      calendarLink: string | null
    }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('calendar:eventSynced', handler)
      return () => ipcRenderer.removeListener('calendar:eventSynced', handler)
    },
    onEventCancelled: (cb: (data: { noteId: string; reminderId: string; reason: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('calendar:eventCancelled', handler)
      return () => ipcRenderer.removeListener('calendar:eventCancelled', handler)
    },
    onEventFailed: (cb: (data: { noteId: string; reminderId: string; error: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('calendar:eventFailed', handler)
      return () => ipcRenderer.removeListener('calendar:eventFailed', handler)
    },
    needsDeleteConfirm: (noteId: string): Promise<boolean> =>
      ipcRenderer.invoke('calendar:needsDeleteConfirm', noteId),
    setDontAskDeleteCalEvent: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('calendar:setDontAskDeleteCalEvent', value),
    getDontAskDeleteCalEvent: (): Promise<boolean> =>
      ipcRenderer.invoke('calendar:getDontAskDeleteCalEvent'),
  },
  reminders: {
    getForNote: (noteId: string): Promise<{
      id: string
      noteId: string
      eventId: string | null
      eventTitle: string
      timestampUtc: string
      originalTz: string
      originalText: string
      confidence: number
      calendarSyncStatus: 'pending' | 'synced' | 'failed' | 'cancelled'
      calendarLink: string | null
      createdAt: string
      lastError: string | null
    } | null> => ipcRenderer.invoke('reminders:getForNote', noteId),
  },
  localModel: {
    getStatus: (): Promise<{ tier: string; modelPath: string | null; ready: boolean }> =>
      ipcRenderer.invoke('localModel:getStatus'),
    download: (tier?: string): Promise<{ ok: boolean; modelPath?: string; error?: string }> =>
      ipcRenderer.invoke('localModel:download', tier),
    onProgress: (cb: (data: { percent: number; done?: boolean; error?: string; modelPath?: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('localModel:progress', handler)
      return () => ipcRenderer.removeListener('localModel:progress', handler)
    },
  },
  digest: {
    getLatest: (period: string): Promise<any> => ipcRenderer.invoke('digests:getLatest', period),
    generate: (period: string): Promise<{ queued: boolean }> => ipcRenderer.invoke('digests:generate', period),
    onUpdated: (cb: (data: { period: string; periodStart: string; narrative: string; stats: string; wordCloudData: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('digest:updated', handler)
      return () => ipcRenderer.removeListener('digest:updated', handler)
    },
    onError: (cb: (data: { period: string; error: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]) => cb(data)
      ipcRenderer.on('digest:error', handler)
      return () => ipcRenderer.removeListener('digest:error', handler)
    },
  },
  onboarding: {
    getStatus: (): Promise<{ done: boolean }> =>
      ipcRenderer.invoke('onboarding:getStatus'),
    complete: (): Promise<void> =>
      ipcRenderer.invoke('onboarding:complete'),
  },
  agent: {
    readHarness: (): Promise<{ agentMd: string; userMd: string; memoryMd: string }> =>
      ipcRenderer.invoke('agent:readHarness'),
    writeHarness: (files: Partial<{ agentMd: string; userMd: string; memoryMd: string }>): Promise<void> =>
      ipcRenderer.invoke('agent:writeHarness', files),
    updateUserProfile: (observation: string): Promise<void> =>
      ipcRenderer.invoke('agent:updateUserProfile', observation),
    runDailyImprovement: (): Promise<{ status: string }> =>
      ipcRenderer.invoke('agent:runDailyImprovement'),
  },
})
