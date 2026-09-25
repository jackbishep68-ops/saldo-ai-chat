// SSE boundaries and UTF-8 characters can span arbitrary network chunks.
export async function* readEvents(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let boundary
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (data) yield data
      }
      if (buffer.length > 1048576) throw new Error('Oversized event')
      if (done) break
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
