import { createServer } from 'node:http'
import { readEvents } from './stream.mjs'
export function createChatServer({ apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_MODEL, fetchImpl = fetch } = {}) {
  return createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (req.url === '/api/health' && req.method === 'GET') return json(200, { ok: true })
    if (req.url !== '/api/chat' || req.method !== 'POST') return json(404, { error: 'Not found.' })
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Cross-origin requests are not allowed.' })
    if (!apiKey || !model?.endsWith(':free') || model.startsWith('openrouter/')) return json(503, { error: 'Set a server API key and a specific :free model in .env.' })
    try {
      let body = ''
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 128000) return json(413, { error: 'Conversation is too long. Start a new chat.' }) }
      const { messages } = JSON.parse(body)
      if (!Array.isArray(messages) || !messages.length || messages.length > 80 || messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 24000)) return json(400, { error: 'Send a valid conversation with up to 80 messages.' })
      const upstream = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: messages.map(({ role, content }) => ({ role, content })), stream: true }),
      })
      if (!upstream.ok) return json(502, { error: 'The model is unavailable. Please try again.' })
      if (!upstream.body) throw new Error('Missing body')
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' })
      res.flushHeaders()
      for await (const event of readEvents(upstream.body)) {
        if (event === '[DONE]') { res.end(JSON.stringify({ done: true }) + '\n'); return }
        const data = JSON.parse(event)
        if (data.error || data.choices?.some(choice => choice.finish_reason === 'error')) throw new Error('Upstream error')
        const text = data.choices?.[0]?.delta?.content
        if (typeof text === 'string' && text) res.write(JSON.stringify({ text }) + '\n')
      }
      throw new Error('Incomplete stream')
    } catch {
      const error = 'Unable to complete the request. Please try again.'
      if (res.headersSent) res.end(JSON.stringify({ error }) + '\n')
      else json(502, { error })
    }
  })
}
