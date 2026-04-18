interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
  organizedText: string | null
  aiInsights: string | null
  tags: string[]
}

interface Window {
  api: {
    notes: {
      getAll: () => Promise<NoteRecord[]>
      create: (rawText: string) => Promise<NoteRecord>
      delete: (id: string) => Promise<void>
      hide: (id: string) => Promise<void>
      reprocess: (id: string) => Promise<void>
      allTags: () => Promise<string[][]>
      recentInsights: () => Promise<Array<{ id: string; tags: string; aiInsights: string; submittedAt: string }>>
      getSimilarPairs: () => Promise<Array<{ a: string; b: string }>>
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
      save: (key: string, provider: string, ollamaModel?: string, llamaCppPath?: string) => Promise<void>
      get: () => Promise<{
        provider: string
        hasKey: boolean
        ollamaModel: string
        modelTier: string
        llamaCppPath: string
        keyStatus: Record<string, boolean>
      }>
      listOllamaModels: () => Promise<string[]>
    }
    kb: {
      listFiles: () => Promise<string[]>
      readFile: (filename: string) => Promise<string | null>
      getTagColors: () => Promise<Record<string, string>>
      setTagColor: (tag: string, color: string) => Promise<void>
      deleteFile: (filename: string) => Promise<void>
      onUpdated: (cb: () => void) => () => void
    }
    localModel: {
      getStatus: () => Promise<{ tier: string; modelPath: string | null; ready: boolean }>
      download: (tier?: string) => Promise<{ ok: boolean; modelPath?: string; error?: string }>
      onProgress: (cb: (data: { percent: number; done?: boolean; error?: string; modelPath?: string }) => void) => () => void
    }
    digest: {
      getLatest: (period: string) => Promise<any>
      generate: (period: string) => Promise<{ queued: boolean }>
      onUpdated: (cb: (data: { period: string; periodStart: string; narrative: string; stats: string; wordCloudData: string }) => void) => () => void
      onError: (cb: (data: { period: string; error: string }) => void) => () => void
    }
    onboarding: {
      getStatus: () => Promise<{ done: boolean }>
      complete: () => Promise<void>
    }
    agent: {
      readHarness: () => Promise<{ agentMd: string; userMd: string; memoryMd: string }>
      writeHarness: (files: Partial<{ agentMd: string; userMd: string; memoryMd: string }>) => Promise<void>
      updateUserProfile: (observation: string) => Promise<void>
      runDailyImprovement: () => Promise<{ status: string }>
    }
  }
}
