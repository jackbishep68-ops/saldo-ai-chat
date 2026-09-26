import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestChat } from '../src/chat.ts';
import { loadHistory, saveHistory } from '../src/history.ts';
test('client decodes split NDJSON, updates one answer without duplicated text', async (t) => {
    const bytes = new TextEncoder().encode('{"text":"Привет 👋"}\n{"text":"!"}\n{"done":true}\n');
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        assert.equal(_url, '/api/chat');
        assert.ok(!JSON.stringify(options).includes('Authorization'));
        return new Response(new ReadableStream({ start(c) { for (const byte of bytes)
                c.enqueue(Uint8Array.of(byte)); c.close(); } }));
    });
    let text = '';
    await requestChat([], chunk => { text += chunk; }, new AbortController().signal);
    assert.equal(text, 'Привет 👋!');
});
test('client preserves text on interrupted and error streams', async (t) => {
    for (const tail of ['', '{"error":"Model busy"}\n']) {
        t.mock.method(globalThis, 'fetch', async () => new Response('{"text":"kept"}\n' + tail));
        let text = '';
        await assert.rejects(requestChat([], chunk => { text += chunk; }, new AbortController().signal), /interrupted|busy/);
        assert.equal(text, 'kept');
    }
});
test('session storage restores meaningful content, tolerates corruption and denial', () => {
    let stored = '';
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } } });
    const messages = [{ id: '1', role: 'assistant' as const, content: 'partial' }, { id: '2', role: 'assistant' as const, content: '' }];
    assert.equal(saveHistory(messages), true);
    assert.deepEqual(loadHistory(), [messages[0]]);
    stored = '{';
    assert.deepEqual(loadHistory(), []);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => { throw new Error('denied'); } });
    assert.equal(saveHistory(messages), false);
    assert.deepEqual(loadHistory(), []);
    delete (globalThis as {
        sessionStorage?: Storage;
    }).sessionStorage;
});
