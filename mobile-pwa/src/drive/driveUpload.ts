import type { NoteEnvelope } from '../envelope'

const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'

export async function uploadNoteToDrive(
  text: string,
  accessToken: string
): Promise<{ fileId: string }> {
  const envelope: NoteEnvelope = {
    v: 1,
    text,
    ts: new Date().toISOString(),
    device: navigator.userAgent.slice(0, 80),
  }
  const body = JSON.stringify(envelope)
  const metadata = {
    name: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    parents: ['appDataFolder'],
  }

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', new Blob([body], { type: 'application/json' }))

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Drive upload failed: ${res.status} ${errText}`)
  }
  const data = await res.json() as { id?: string }
  if (!data.id) throw new Error('Drive upload returned no file id')
  return { fileId: data.id }
}
