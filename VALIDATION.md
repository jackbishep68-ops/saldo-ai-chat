# Validation record

Verified on Windows with Node v24.19.0, September 25, 2026.
`npm` was not on the agent PATH; commands used the installed npm CLI through
`node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"`.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Clean dependency installation | PASS | `npm ci --offline --prefix C:\Dev\saldo-ai-chat-install-check`: 160 packages, scripts enabled, exit 0; existing npm cache, no network download |
| Build from clean installation | PASS | Copied source/config to the isolated check directory; `npm run build` exited 0 |
| `npm run build` in project | PASS | TypeScript + Vite production bundle, exit 0 |
| `npm run lint` | PASS | Frontend, tests, Node API and dev scripts, exit 0 |
| `npm test` | PASS | 15 passed, 0 failed |
| `npm run dev` | PASS | API and Vite start together; API health, frontend page, proxied health each HTTP 200 |
| `.env` protection | PASS | `git check-ignore .env` recognizes the ignore rule; `git ls-files .env` is empty; no real `.env` exists |
| Bundle scan | PASS | No `OPENROUTER_API_KEY`, test credential sentinels, or upstream API endpoint in built assets |
| Browser request construction | PASS | Client test intercepts fetch: only `/api/chat`, no Authorization header; server test confirms the credential exists only in upstream headers |
| Live browser Network header inspection | NOT DONE | Browser tooling did not expose a Network capture; this claim is supported by source/tests/bundle checks, not a DevTools capture |
| Live OpenRouter completion | NOT DONE | No real API key/model configured; actual server returns an understandable 503 |

## Browser smoke results

Used the Codex in-app browser. Stream/error cases use the explicit
`tests/browser-server.mjs` fixture, which labels every answer as test data.
The fixture makes no OpenRouter requests and was stopped after verification.
The normal API was restarted; the preview is left in its clean empty state.

| Functional requirement | Result |
| --- | --- |
| Empty state, suggested prompts and disabled empty Send | PASS |
| Enter sends; Shift+Enter inserts newline | PASS |
| Progressive updates to one assistant message | PASS with fixture |
| Stop retains partial text and re-enables composer | PASS with fixture |
| Send immediately after Stop | PASS with fixture |
| Esc cancels generation | PASS with fixture |
| Reload restores partial conversation without spinner | PASS with fixture |
| 429 displays readable error | PASS with fixture |
| Network failure and completely stopped API | PASS; both shown without broken UI |
| Server timeout before/after headers | PASS automated integration tests |
| Whitespace-only input | PASS; Send remains disabled |
| Tab focus | PASS; visible 3px green custom outline on Send |
| Long unbroken response | PASS at 375px; wrapping stays inside conversation |
| Mobile empty state | PASS at 320px and 375px; no horizontal page overflow; all prompt cards visible after correction |
| Session storage corruption / denial | PASS automated tests |
| Real free-model availability/authentication/quota | NOT DONE; Ivan must configure `.env` and send a real prompt |
| Screen-reader audio and physical mobile keyboard | NOT DONE |

## Initial failures and corrections

- Initial default Vite config bundling and isolated test processes hit sandbox
  `spawn EPERM`; native Vite config loading and in-process test execution pass.
- Initial lint failed on missing error causes; fixed and verified.
- A test rerun encountered ephemeral-port reuse on Windows; explicit loopback
  test ports resolved it, and subsequent runs pass.
- Proxied POST initially returned 403 due to Origin validation; fixed, covered
  by a regression test, and verified through Vite.
- At 320px, the initial empty-state height cap clipped cards; corrected and
  verified in a repeated screenshot and DOM dimension check.
- The combined dev command initially failed in Node watch mode (`EPERM`);
  removing nested watch processes made the actual `npm run dev` command pass.
- Browser opening initially timed out during automatic permission review;
  the allowed retry succeeded and the above browser checks were completed.

## Final manual checks for Ivan

1. Copy `.env.example` to `.env`, supply a key and a current specific `:free`
   model ID. Keep the key out of chat messages and Git.
2. Restart `npm run dev`; send a real prompt, stop its streamed answer, and
   send another prompt. Check your browser's Network tab: only `/api/chat`
   should be used for chat, with no OpenRouter Authorization header.
3. Review the feature branch and the PR before merging. No merge was performed.
