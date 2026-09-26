import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createChatServer } from './app.mjs';
import { readEvents } from './stream.mjs';
const message = { messages: [{ role: 'user', content: 'Hello' }] };
const frame = text => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const stream = text => new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
test('timeout after headers preserves partial output and ends the stream', async t => {
    const post = await serve(t, { timeoutMs: 30, fetchImpl: async (_, { signal }) => new Response(new ReadableStream({ start(c) {
        c.enqueue(new TextEncoder().encode(frame('partial')));
        signal.addEventListener('abort', () => c.error(signal.reason), { once: true });
    } })) });
    const text = await (await post()).text();
    assert.match(text, /partial/);
    assert.match(text, /too long/);
    assert.ok(!text.includes('"done":true'));
});
test('Vite browser origin is accepted, empty model output is a failure', async t => {
    const post = await serve(t, { fetchImpl: async () => stream('data: [DONE]\n\n') });
    const response = await post(message, { headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /returned no text/);
});
let nextPort = 32100;
async function serve(t, options = {}) {
    const server = createChatServer({ apiKey: 'test-secret-only', model: 'test/model:free', ...options });
    server.listen(nextPort++, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const url = `http://127.0.0.1:${server.address().port}/api/chat`;
    return (body = message, extra = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...extra });
}
test('SSE handles every byte boundary, CRLF, comments, Unicode and multiple events', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\ndata: привет 👋\r\n\r\ndata: [DONE]\n\n');
    const body = new ReadableStream({ start(c) { for (const byte of bytes)
            c.enqueue(Uint8Array.of(byte)); c.close(); } });
    const events = [];
    for await (const event of readEvents(body))
        events.push(event);
    assert.deepEqual(events, ['привет 👋', '[DONE]']);
});
test('streams incrementally, sanitizes request, keeps key server-side', async (t) => {
    let finish;
    const post = await serve(t, { fetchImpl: async (url, options) => {
            assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
            assert.equal(options.headers.Authorization, 'Bearer test-secret-only');
            assert.equal(JSON.parse(options.body).stream, true);
            return new Response(new ReadableStream({ start(c) {
                    c.enqueue(new TextEncoder().encode(frame('First')));
                    finish = () => { c.enqueue(new TextEncoder().encode(frame(' second') + 'data: [DONE]\n\n')); c.close(); };
                } }));
        } });
    const response = await post();
    const reader = response.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.equal(first, '{"text":"First"}\n');
    finish();
    let rest = '';
    while (true) {
        const result = await reader.read();
        if (result.done)
            break;
        rest += new TextDecoder().decode(result.value);
    }
    assert.equal(rest, '{"text":" second"}\n{"done":true}\n');
    assert.ok(!(first + rest).includes('test-secret-only'));
});
for (const status of [429, 500, 401])
    test(`maps upstream HTTP ${status} without leaking upstream details`, async (t) => {
        const post = await serve(t, { fetchImpl: async () => new Response('test-secret-only', { status }) });
        const response = await post();
        assert.equal(response.status, status === 429 ? 429 : 502);
        assert.ok(!(await response.text()).includes('test-secret-only'));
    });
test('timeout before headers returns 504', async (t) => {
    const post = await serve(t, { timeoutMs: 25, fetchImpl: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
    const response = await post();
    assert.equal(response.status, 504);
    assert.match(await response.text(), /too long/);
});
test('network failure returns understandable error', async (t) => {
    const post = await serve(t, { fetchImpl: async () => { throw new TypeError('socket'); } });
    const response = await post();
    assert.equal(response.status, 502);
    assert.match(await response.text(), /interrupted/);
});
test('midstream upstream error and premature EOF preserve partial text', async (t) => {
    for (const ending of ['', 'data: {"error":{"code":429,"message":"test-secret-only"}}\n\n']) {
        const post = await serve(t, { fetchImpl: async () => stream(frame('partial') + ending) });
        const text = await (await post()).text();
        assert.match(text, /partial/);
        assert.match(text, /"error"/);
        assert.ok(!text.includes('test-secret-only'));
        assert.ok(!text.includes('"done":true'));
    }
});
test('disconnect aborts upstream and another request can succeed', async (t) => {
    let aborted;
    const canceled = new Promise(resolve => { aborted = resolve; });
    let calls = 0;
    const post = await serve(t, { fetchImpl: async (_, { signal }) => {
            if (++calls > 1)
                return stream(frame('next') + 'data: [DONE]\n\n');
            return new Response(new ReadableStream({ start(c) {
                    c.enqueue(new TextEncoder().encode(frame('partial')));
                    signal.addEventListener('abort', () => { aborted(); c.error(signal.reason); }, { once: true });
                } }));
        } });
    const controller = new AbortController();
    const response = await post(message, { signal: controller.signal });
    await response.body.getReader().read();
    controller.abort();
    await Promise.race([canceled, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('not canceled')), 1000); timer.unref(); })]);
    assert.match(await (await post()).text(), /next/);
});
test('invalid input, cross-origin requests and invalid model are rejected', async (t) => {
    const post = await serve(t, { fetchImpl: () => { throw new Error('must not call'); } });
    assert.equal((await post({ messages: [] })).status, 400);
    assert.equal((await post(null)).status, 400);
    assert.equal((await post(message, { body: '{' })).status, 400);
    assert.equal((await post(message, { headers: { origin: 'https://elsewhere.test' } })).status, 403);
    assert.equal((await post({ messages: [{ role: 'user', content: 'x'.repeat(129000) }] })).status, 413);
    const unconfigured = await serve(t, { model: 'paid/model' });
    assert.equal((await unconfigured()).status, 503);
});
