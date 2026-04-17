interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
  organizedText: string | null
}

interface Window {
  api: {
    notes: {
      getAll: () => Promise<NoteRecord[]>
      create: (rawText: string) => Promise<NoteRecord>
      delete: (id: string) => Promise<void>
      hide: (id: string) => Promise<void>
      reprocess: (id: string) => Promise<void>
    }
    onAiUpdate: (cb: (data: {
      noteId: string
      aiState: string
      aiAnnotation: string | null
      organizedText: string | null
      tags: string[]
      insights: string | null
    }) => void) => () => void
    settings: {
      save: (key: string, provider: string, ollamaModel?: string, braveKey?: string) => Promise<void>
      get: () => Promise<{ provider: string; hasKey: boolean; ollamaModel: string; hasBraveKey: boolean; modelTier: string }>
    }
    kb: {
      listFiles: () => Promise<string[]>
      readFile: (filename: string) => Promise<string | null>
      getTagColors: () => Promise<Record<string, string>>
      setTagColor: (tag: string, color: string) => Promise<void>
      onUpdated: (cb: () => void) => () => void
    }
    localModel: {
      getStatus: () => Promise<{ tier: string; modelPath: string | null; ready: boolean }>
    }
    digest: {
      getLatest: (period: string) => Promise<any>
      generate: (period: string) => Promise<{ queued: boolean }>
      onUpdated: (cb: (data: { period: string; periodStart: string; narrative: string; stats: string; wordCloudData: string }) => void) => () => void
    }
  }
}
