import { useRef, useState } from 'react'

interface CaptureBufferProps {
  onSubmit: (text: string) => void
}

export function CaptureBuffer({ onSubmit }: CaptureBufferProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = value.trim()
      if (!trimmed) return
      onSubmit(trimmed)
      setValue('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    // Auto-grow
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <div className="border-t border-white/10 bg-black/30 px-4 pt-3 pb-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Capture a thought… (Enter to submit)"
        rows={1}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none overflow-hidden focus:outline-none focus:border-amber-500/40 focus:bg-white/8 transition-colors"
        autoFocus
      />
      <p className="mt-1 text-xs text-gray-600">Enter to submit · Shift+Enter for newline</p>
    </div>
  )
}
