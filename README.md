# Saldo AI Chat

A one-page AI chat built for the Saldo hiring assignment. It streams answers, supports cancellation without losing partial text, handles service failures, and keeps conversation history for the current browser session.

## Run locally (about five minutes)

Requires **Node.js 22.18+** (Node 24 recommended) and npm. Native TypeScript config loading and the built-in test runner keep the toolchain small.

```sh
npm ci
```

Copy `.env.example` to `.env` in the project root:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux: `cp .env.example .env`.

Set `OPENROUTER_API_KEY` in **that server-only file**. Set `OPENROUTER_MODEL` to a currently available, specific model ID ending in `:free`, selected from [OpenRouter's free model catalog](https://openrouter.ai/models?max_price=0). No model is hard-coded because free-model availability changes. Generic `openrouter/` routers are deliberately rejected. A key and model are required for real answers; missing configuration produces a clear error.

```sh
npm run dev
```

Open **http://localhost:5173**. The command starts Vite and the API together; Ctrl+C stops both. Keep the default API port **3001**, which matches `vite.config.ts`. If either port is occupied, stop the other process. An alternative is two terminals running `npm run dev:server` and `npm run dev:client`.

Vite hot-reloads frontend edits. Restart the command after changing server code or `.env`; the API intentionally runs without Node watch-mode subprocesses.

`CHAT_TIMEOUT_MS` defaults to 60000 and is capped at 120000. `APP_ORIGIN` defaults to the local Vite origin. Changing ports requires updating the proxy target and/or the allowed browser origin. No actual key belongs in README, Git, a screenshot, or a `VITE_*` variable.

## Stack and architecture

- React 19, TypeScript, Vite; plain CSS, no component library or global state dependency.
- Node's built-in HTTP server, fetch, AbortController, environment-file loading, and test runner. No additional backend runtime dependencies.

```text
Browser → POST /api/chat → local Node API → OpenRouter
        ← NDJSON events ← parsed SSE    ← streaming response
```

The browser sends only conversation roles and text to its own origin. Vite proxies `/api` to the loopback API. Only `server/app.mjs` reads `OPENROUTER_API_KEY` and adds the upstream Authorization header. The server never reflects upstream bodies, headers, credentials, or provider error messages back to the client. It does not log keys or prompts. The frontend has no environment-variable access and no OpenRouter requests. `.env` and its variants are ignored; `.env.example` contains placeholders only.

The API accepts user/assistant messages, validates input, limits the request body to 128000 bytes, and rejects unexpected browser origins. It binds to loopback. These are local-development safeguards, not a public deployment/authentication system.

## Streaming and cancellation

`server/stream.mjs` incrementally parses SSE, including split UTF-8 characters, split event delimiters, CRLF, and comment heartbeats. It forwards only text, completion, or a sanitized error as newline-delimited JSON. It does not wait for the complete model answer. A `[DONE]` marker confirms completion; premature EOF or a text-free result is an error. See the [OpenRouter streaming specification](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/streaming.mdx).

The client decodes NDJSON across arbitrary chunk boundaries and appends text to one assistant message. Stop and Esc abort the current fetch immediately. Closing the browser connection aborts the upstream fetch too. Every request gets a fresh controller; identity checks prevent late updates from an old request affecting a new one. Meaningful partial text stays visible, while empty assistant placeholders are removed. Unmounting cancels active work.

## Failures and recovery

HTTP 429 reports a busy model or exhausted quota without automatic retry loops. Other upstream HTTP failures, invalid configuration, network errors, malformed streams, and unexpected EOF have readable messages. A server deadline covers the upstream fetch and stream; a separate 130-second client deadline covers a stalled proxy connection. A timeout or interruption after streaming begins preserves the partial answer. Errors use `role="alert"`; generation always releases the UI so the user can send another message. Resend a prompt to retry, or use New chat when the conversation exceeds the request limits.

## Session history and interactions

`sessionStorage` survives a reload in the same tab/session without creating long-lived personal history. Only message IDs, roles, and meaningful text are saved, including received partial text. Controllers, loading flags, errors, and secrets are not stored. New chat clears the saved conversation. Corrupt or unavailable storage cannot crash the page; failed writes display a warning. Browser session restoration may retain sessionStorage according to browser settings. Sending a prompt transmits the conversation to OpenRouter and its selected provider; local session storage does not change their retention policies.

Enter sends a nonempty message; Shift+Enter inserts a newline. IME composition does not trigger accidental submission. Esc stops generation. Controls remain reachable with Tab, and focus returns to the composer after requests. Scrolling follows new text only while the reader remains near the bottom. Long unbroken text wraps, and the conversation has an independently scrollable region.

## Accessibility decision

The brief asks to remove the standard focus outline while also requiring keyboard accessibility. Removing all focus indication would conflict with that requirement. Browser-default outlines are replaced with a deliberate, contrasting **3px `:focus-visible` outline**, plus a composer focus border. Semantic buttons, a labeled textarea, headings, landmarks, a keyboard-scrollable conversation, a status announcement, and error alerts support keyboard and assistive-technology use. Token-by-token text is not a live region, avoiding a screen reader announcing every token; readers can navigate the conversation after the status changes.

## Validation

```sh
npm run build
npm run lint
npm test
```

Tests use injected, explicitly artificial upstream responses, never real API credits. `npm test` covers 15 cases across stream parsing, progressive delivery, cancellation, status mapping, midstream errors, deadlines, input/origin validation, frontend decoding, and persistence. Test isolation is disabled to avoid subprocess requirements in constrained environments. Integration tests use loopback ports 32100 onward; keep that small port range free.

To reproduce browser smoke checks **without a key**, stop the normal API, run `node tests/browser-server.mjs`, and separately run `npm run dev:client`. This explicit fixture announces itself in the terminal and in every answer. It is never imported by the normal application server. Send `stream` for a slow stream, `long` for an unbroken line, `429` for rate limiting, or `network` for a simulated upstream interruption. Stop the fixture and restart the real API afterward.

The implementation is complete. Automated tests and local fixture checks passed for streaming, Stop/cancellation, session restoration, HTTP 429, timeout, and network-error handling. See [VALIDATION.md](VALIDATION.md) for the verification scope.

### Live-provider verification blocked

A real OpenRouter completion could not be verified. On September 26, 2026, direct access to `openrouter.ai` returned a security/Cloudflare block page, which persisted across desktop and mobile attempts. An alternative official authentication attempt used Stripe CLI: the CLI installed and ran successfully, but device authorization could not complete because connections to `access.stripe.com` timed out or were forcibly closed. No real OpenRouter API key was obtained, and no live provider request was performed. Live OpenRouter integration is therefore **not verified**.

OpenRouter remains the required provider; it has not been replaced. The existing code path remains configured to use a server-side `OPENROUTER_API_KEY` and a specific `:free` model when credentials become available.

## Known limitations

- Live OpenRouter verification is blocked by the access/authentication limitations above. Authentication, current free-model availability, and account quota still require a real-key smoke test. Free models may be busy or disappear.
- Plain text rendering, intentionally: no Markdown/HTML execution, citations UI, attachments, or tool calls.
- No database, accounts, cross-tab sync, automatic retry, or deployment infrastructure. `npm start` starts only the API; a public deployment needs a static host/reverse proxy and abuse controls before exposing it.
- Requests accept at most 80 messages, 24000 characters per message, and 128000 body bytes. The input itself is capped at 12000 characters. Session restore accepts at most 80 messages and 256000 serialized characters; very large history should be cleared with New chat.
- Modern browsers supporting fetch streams, AbortSignal.any/timeout, and sessionStorage are required. Physical mobile keyboards and screen-reader audio were not tested.
- The API has no automatic retry, because retrying can consume quota or duplicate requests. An aborted partial answer remains in subsequent context by design.

## With one more day

Add automated browser regression tests, screen-reader checks, a retry/edit-last-prompt interaction, an explicit conversation-size meter, and measured render batching for high-token-rate output. For a real deployment, add per-user rate limiting and a carefully configured same-origin production host.

## AI usage log

AI/Codex assisted implementation, not just proofreading. It reviewed the requirements, generated the React UI and Node proxy, implemented the stream parsers and cancellation flow, wrote tests, ran builds and browser smoke checks, and drafted this documentation. The original bootstrap Git history was preserved, with separate feature commits for the requested phases.

Concrete corrections during this session:

1. Lint found generated error-wrapping code that discarded the original cause. The wrappers were corrected to preserve `cause`, and lint passed.
2. HTTP smoke testing through Vite revealed that the initial same-host Origin check rejected the actual proxied request with 403. The local browser origin was explicitly allowed, a regression test was added, and the normal request then returned the expected missing-configuration 503.
3. At 320px width, the original conversation height cap clipped empty-state suggestions. Browser screenshots exposed this; the cap is now applied only to an active conversation. The repeated check showed no clipping or horizontal page overflow.
4. Initial tests under the Windows sandbox hit subprocess restrictions and later ephemeral-port reuse errors. The runner now uses in-process test isolation and explicit local integration-test ports; the final 15 tests pass.

Environment issues were also handled transparently: npm was not on the agent PATH, so checks used the installed npm CLI by absolute path. Vite's native config loader avoided blocked config-bundling subprocesses. Browser permission review initially timed out; the permitted retry succeeded. No real OpenRouter key was supplied or used, and test-fixture answers are not claimed as model answers.

## License

[MIT](LICENSE), copyright 2026 Ivan Malinin.
