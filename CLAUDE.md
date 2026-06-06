# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start proxy server + Vite dev server together
npm run dev -- --no-proxy  # start Vite only, without the proxy
npm run build        # production build
npm run preview      # build preview bundle, then start proxy server + Vite preview together
npm run preview -- --no-proxy  # build and preview without the proxy
npm run lint         # type-check only (tsc --noEmit), no eslint
npm run clean        # remove dist/
```

There are no automated tests.

## Non-blocking preview for agents

When a preview is needed for user inspection, do not leave `npm run preview` attached to the agent terminal. First clear only the concrete PIDs listening on `:7888` or `:5174`, then start a detached preview:

```bash
setsid bash -lc 'cd /home/aliyah/Mojo-English && exec npm run preview -- --host 0.0.0.0 --port 7888 > /tmp/mojo-vite-preview.log 2>&1' </dev/null >/dev/null 2>&1 &
sleep 8
ss -ltnp '( sport = :7888 or sport = :5174 )' || true
curl -I --max-time 5 http://127.0.0.1:7888/
```

## Architecture

Mojo is a local-first React 19 + Vite SPA for AI-assisted English learning. All user data lives in browser IndexedDB via `idb`. There is no backend — the only server-side component is a development proxy.

### Dev/preview proxy

In development and preview, `proxy-server.mjs` runs on `:5174` and Vite forwards `/api/proxy?target=<url>` requests to it. This prevents CORS issues when calling external LLM APIs directly from the browser. `src/lib/proxyUrl.ts` wraps any external URL with this redirect. `npm run preview` builds the preview bundle with proxy support enabled before serving it; pass `-- --no-proxy` to disable the proxy for either dev or preview. Plain production builds keep the proxy absent and `proxyUrl()` is a no-op.

### LLM abstraction (`src/services/llm.ts`)

Two public functions — `chatCompletion` and `streamChatCompletion` — dispatch to provider-specific implementations for `OPENAI`, `GEMINI`, and `CLAUDE` types. Provider config (base URL, API key, active model, per-task model overrides) is read from Zustand at call time. All requests go through `proxyUrl()`.

### State (`src/store/`)

Zustand is the single source of truth for app config, active provider, theme, and user progress. Config is persisted to IndexedDB on change.

### Routing (`src/App.tsx`)

React Router v7 with a `ProtectedRoute` wrapper that redirects to `/oobe` until onboarding is complete. Routes: `/oobe`, `/setup`, `/` (home), `/words`, `/news`, `/writing`, `/dictionary`, `/decks`, `/stories`.

### Key services

- `src/services/llm.ts` — LLM provider abstraction (see above)
- `src/services/newsPipeline.ts` — fetches and AI-processes news articles
- `src/services/dictionaryDb.ts` — IndexedDB-backed dictionary storage
- `src/services/notificationService.ts` — Upstash QStash integration for scheduled push reminders
- `src/lib/decks.ts` — parses Anki `.apkg` files using `sql.js` (WASM SQLite) + `jszip`; schedules cards with `ts-fsrs`
- `src/lib/i18n.ts` — i18n strings (large file, ~43 KB)

### Path alias

`@` resolves to the project root (not `src/`). Import as `@/src/...` or `@/package.json` etc.
