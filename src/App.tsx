import { useState } from 'react'
import './App.css'
export type Message = { id: string; role: 'user' | 'assistant'; content: string }
function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  function stop() { setGenerating(false) }
  function send() {
    if (!input.trim() || generating) return
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', content: input.trim() }])
    setInput('')
    setGenerating(true)
  }
  return <div className="app">
    <header><a className="brand" href="#main"><b className="brand-mark">s.</b> saldo <span>/ ai chat</span></a><span className="badge">Session chat</span></header>
    <main id="main"><div className="intro"><span className="eyebrow">A LITTLE CLARITY, ON DEMAND</span><h1>Space to think.</h1><p>Ask a question. Explore an idea. Find your next step.</p></div>
    <section className="conversation" aria-label="Conversation">
    {messages.length === 0 ? <div className="empty"><span className="spark" aria-hidden="true">✳</span><h2>What’s on your mind?</h2><p>Start somewhere. We’ll take it from there.</p><div className="suggestions">{['Explain a complex idea simply', 'Help me plan my week', 'Brainstorm a new project'].map(prompt => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div></div> : <ol className="messages">{messages.map(message => <li className={`message ${message.role}`} key={message.id}><span className="speaker">{message.role === 'user' ? 'You' : 'Saldo AI'}</span><p>{message.content}</p></li>)}</ol>}
    </section>
    <div className="composer-area"><p className="status" role="status">{generating ? '● Thinking and writing…' : 'Ready when you are'}</p><form className="composer" onSubmit={event => { event.preventDefault(); send() }}><label className="sr-only" htmlFor="message">Your message</label><textarea id="message" placeholder="Ask anything, or think out loud…" value={input} onChange={event => setInput(event.target.value)} rows={3} maxLength={12000}/><div className="composer-bottom"><span>Shift + Enter for a new line</span>{generating ? <button type="button" className="primary" onClick={stop}>Stop ■</button> : <button className="primary" disabled={!input.trim()}>Send ↑</button>}</div></form><p className="footnote">AI can make mistakes. Take a moment to check important details.</p></div>
    </main><footer>POWERED BY OPENROUTER<span>Made for a clearer next step.</span></footer>
  </div>
}
export default App
