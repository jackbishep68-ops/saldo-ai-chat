import type { Message } from './App'

export async function requestChat(messages: Message[], onText: (text: string) => void) {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.filter(m => m.content.trim()).map(({ role, content }) => ({ role, content })) }) })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'The request failed. Please try again.')
  }
  if (!response.body) throw new Error('Streaming is unavailable in this browser.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let end
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        if (!line) continue
        const event = JSON.parse(line)
        if (event.error) throw new Error(event.error)
        if (typeof event.text === 'string') onText(event.text)
        if (event.done) return
      }
      if (done) throw new Error('Connection interrupted. Your partial answer has been kept.')
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
