import { createChatServer } from './app.mjs'
const port = Number(process.env.PORT || 3001)
createChatServer().listen(port, '127.0.0.1', () => console.log(`Chat API: http://127.0.0.1:${port}`))
