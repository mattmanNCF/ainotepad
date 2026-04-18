// src/main/similarity.ts

const STOP_WORDS = new Set([
  'the','a','an','is','it','in','on','at','to','of','and','or','for',
  'with','this','that','was','are','be','as','by','from','have','has',
  'had','not','but','we','you','i','he','she','they','do','did','so',
  'if','its','also','can','will','just','about','what','when','how',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

function tfIdf(doc: string[], corpus: string[][]): Record<string, number> {
  const tf: Record<string, number> = {}
  for (const t of doc) tf[t] = (tf[t] ?? 0) + 1
  const N = corpus.length
  const result: Record<string, number> = {}
  for (const [term, freq] of Object.entries(tf)) {
    const df = corpus.filter((d) => d.includes(term)).length
    result[term] = (freq / doc.length) * Math.log(N / (df + 1))
  }
  return result
}

function cosineSim(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (const [k, v] of Object.entries(a)) {
    dot += v * (b[k] ?? 0)
    magA += v * v
  }
  for (const v of Object.values(b)) magB += v * v
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export function computeSimilarPairs(
  noteTexts: Map<string, string>,
  _noteTags: Map<string, string[]>,
  tagToNoteIds: Map<string, string[]>,
  threshold: number
): Array<{ a: string; b: string }> {
  const tokens = new Map<string, string[]>()
  for (const [id, text] of noteTexts) {
    tokens.set(id, tokenize(text))
  }

  const corpus = [...tokens.values()]
  const vectors = new Map<string, Record<string, number>>()
  for (const [id, doc] of tokens) {
    if (doc.length < 4) continue  // skip notes with < 4 meaningful tokens
    vectors.set(id, tfIdf(doc, corpus))
  }

  const seen = new Set<string>()
  const pairs: Array<{ a: string; b: string }> = []

  for (const [_tag, noteIds] of tagToNoteIds) {
    for (let i = 0; i < noteIds.length; i++) {
      for (let j = i + 1; j < noteIds.length; j++) {
        const a = noteIds[i]
        const b = noteIds[j]
        const key = [a, b].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        const va = vectors.get(a)
        const vb = vectors.get(b)
        if (!va || !vb) continue
        if (cosineSim(va, vb) >= threshold) pairs.push({ a, b })
      }
    }
  }
  return pairs
}
