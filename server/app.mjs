import { createServer } from 'node:http';
import { readEvents } from './stream.mjs';
export function createChatServer({ apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_MODEL, fetchImpl = fetch, timeoutMs = Number(process.env.CHAT_TIMEOUT_MS || 60000) } = {}) {
    return createServer(async (req, res) => {
        const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
        if (req.url === '/api/health' && req.method === 'GET')
            return json(200, { ok: true });
        if (req.url !== '/api/chat' || req.method !== 'POST')
            return json(404, { error: 'Not found.' });
        const allowedOrigins = new Set([`http://${req.headers.host}`, process.env.APP_ORIGIN || 'http://127.0.0.1:5173', 'http://localhost:5173']);
        if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
            return json(403, { error: 'Cross-origin requests are not allowed.' });
        if (!apiKey || !model?.endsWith(':free') || model.startsWith('openrouter/'))
            return json(503, { error: 'Set a server API key and a specific :free model in .env.' });
        const controller = new AbortController();
        let timedOut = false;
        const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(Math.max(timeoutMs || 60000, 10), 120000));
        const onClose = () => { if (!res.writableEnded)
            controller.abort(); };
        res.on('close', onClose);
        try {
            let body = '';
            req.setEncoding('utf8');
            for await (const chunk of req) {
                body += chunk;
                if (Buffer.byteLength(body) > 128000)
                    return json(413, { error: 'Conversation is too long. Start a new chat.' });
            }
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                return json(400, { error: 'Request must contain valid JSON.' });
            }
            const { messages } = parsed || {};
            if (!Array.isArray(messages) || !messages.length || messages.length > 80 || messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 24000))
                return json(400, { error: 'Send a valid conversation with up to 80 messages.' });
            const upstream = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
                signal: controller.signal,
                method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: messages.map(({ role, content }) => ({ role, content })), stream: true }),
            });
            if (!upstream.ok) {
                await upstream.body?.cancel();
                return json(upstream.status === 429 ? 429 : 502, { error: upstream.status === 429 ? 'The free model is busy or its quota is reached. Wait a little, then retry.' : 'The model is unavailable. Please try again later.' });
            }
            if (!upstream.body)
                throw new Error('Missing body');
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
            res.flushHeaders();
            let receivedText = false;
            for await (const event of readEvents(upstream.body)) {
                if (event === '[DONE]') {
                    if (!receivedText) {
                        res.end(JSON.stringify({ error: 'The model returned no text. Please try again.' }) + '\n');
                        return;
                    }
                    res.end(JSON.stringify({ done: true }) + '\n');
                    return;
                }
                const data = JSON.parse(event);
                if (data.error || data.choices?.some(choice => choice.finish_reason === 'error')) {
                    const error = String(data.error?.code) === '429' ? 'The free model is busy or its quota is reached. Wait a little, then retry.' : 'The model stopped unexpectedly. Your partial answer has been kept.';
                    res.end(JSON.stringify({ error }) + '\n');
                    return;
                }
                const text = data.choices?.[0]?.delta?.content;
                if (typeof text === 'string' && text) {
                    receivedText = true;
                    res.write(JSON.stringify({ text }) + '\n');
                }
            }
            throw new Error('Incomplete stream');
        }
        catch {
            if (res.destroyed)
                return;
            const error = timedOut ? 'The model took too long. Your partial answer has been kept. Please retry.' : 'Connection to the model was interrupted. Your partial answer has been kept. Please retry.';
            if (res.headersSent)
                res.end(JSON.stringify({ error }) + '\n');
            else
                json(timedOut ? 504 : 502, { error });
        }
        finally {
            clearTimeout(deadline);
            controller.abort();
            res.off('close', onClose);
        }
    });
}
