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
    }
    onAiUpdate: (cb: (data: { noteId: string; aiState: string; aiAnnotation: string | null; organizedText: string | null; tags: string[] }) => void) => () => void
    settings: {
      save: (key: string, provider: string) => Promise<void>
      get: () => Promise<{ provider: string; hasKey: boolean }>
    }
    kb: {
      listFiles: () => Promise<string[]>
      readFile: (filename: string) => Promise<string | null>
      getTagColors: () => Promise<Record<string, string>>
      setTagColor: (tag: string, color: string) => Promise<void>
      onUpdated: (cb: () => void) => () => void
    }
  }
}
