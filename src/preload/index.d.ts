interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
}

interface Window {
  api: {
    notes: {
      getAll: () => Promise<NoteRecord[]>
      create: (rawText: string) => Promise<NoteRecord>
    }
  }
}
