import { Conf } from 'electron-conf/main'

// Separate Conf instance scoped to tag color storage.
// Using a distinct type here avoids coupling to ipc.ts's Conf type.
// This module has NO imports from other project files — it cannot create circular dependencies.
const tagConf = new Conf<{ tagColors: Record<string, string> }>({ name: 'settings' })

export function getTagColors(): Record<string, string> {
  return tagConf.get('tagColors', {})
}

export function setTagColors(colors: Record<string, string>): void {
  tagConf.set('tagColors', colors)
}
