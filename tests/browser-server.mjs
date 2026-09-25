// Explicit browser-test fixture. Never imported by the normal server entry point.
import { createChatServer } from '../server/app.mjs'
const encoder = new TextEncoder()
createChatServer({
  apiKey: 'browser-test-secret', model: 'test/fixture:free', timeoutMs: 45000,
  fetchImpl: async (_url, { body, signal }) => {
    const prompt = JSON.parse(body).messages.at(-1).content
    if (prompt === '429') return new Response('', { status: 429 })
    if (prompt === 'network') throw new TypeError('Test network interruption')
    return new Response(new ReadableStream({ start(controller) {
      let count = 0
      const send = text => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`))
      send('TEST FIXTURE — not a model response. ')
      const timer = setInterval(() => {
        send(prompt === 'long' ? 'unbroken'.repeat(80) + '\n' : `chunk ${++count}. `)
        if (prompt === 'long' || count === 30) {
          clearInterval(timer)
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          signal.removeEventListener('abort', abort)
        }
      }, 700)
      function abort() { clearInterval(timer); controller.error(signal.reason) }
      signal.addEventListener('abort', abort, { once: true })
    } }))
  },
}).listen(3001, '127.0.0.1', () => console.log('TEST FIXTURE ONLY: API on port 3001. No OpenRouter requests.'))
