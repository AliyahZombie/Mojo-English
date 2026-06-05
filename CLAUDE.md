# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start proxy server + Vite dev server together
npm run dev -- --no-proxy  # start Vite only, without the proxy
npm run build        # production build
npm run lint         # type-check only (tsc --noEmit), no eslint
npm run clean        # remove dist/
```

There are no automated tests.

## Architecture

Mojo is a local-first React 19 + Vite SPA for AI-assisted English learning. All user data lives in browser IndexedDB via `idb`. There is no backend — the only server-side component is a development proxy.

### Dev proxy

In development, `proxy-server.mjs` runs on `:5174` and Vite forwards `/api/proxy?target=<url>` requests to it. This prevents CORS issues when calling external LLM APIs directly from the browser. `src/lib/proxyUrl.ts` wraps any external URL with this redirect. In production builds the proxy is absent and `proxyUrl()` is a no-op.

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
