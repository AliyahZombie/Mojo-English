# Repository Instructions

## Project Shape
- Single-package npm app: Vite + React 19 + TypeScript + Tailwind CSS v4; `package-lock.json` is the lockfile.
- App boot path is `index.html` -> `src/main.tsx` -> `src/App.tsx`; routes are defined in `src/App.tsx` and gated by `hasConfigured` from `src/store/useAppStore.ts`.
- Core behavior lives in `src/store/*` and `src/services/*`: FSRS review state, persisted app/chat state, LLM calls, Anki `.apkg` parsing, dictionary IndexedDB cache, and QStash notifications.

## Commands
- Install: `npm install`.
- Dev server: `npm run dev`.
- Production build: `npm run build`.
- Preview build: `npm run preview`.
- Typecheck: `npm run lint` (this runs `tsc --noEmit`; there is no ESLint config/script).
- No test runner, CI workflow, formatter config, or codegen command is configured in this checkout.

## Completion Workflow
- Conserve local CPU and memory: prefer the lightest verification that matches the change; avoid heavy checks for docs-only edits unless the user asks.
- Do not launch or automate a browser unless the user explicitly asks for browser inspection.
- After completing code changes, run the relevant verification, then restart and expose the app preview on `0.0.0.0:7888` for user inspection when useful.
- For UI or behavior changes, use the full preview flow after verification and always restart the preview, even when one is already running:
  1. Build first: `npm run build`.
  2. Check whether the preview port is already occupied: `ss -ltnp '( sport = :7888 )' || true`.
  3. If anything is listening on `0.0.0.0:7888` or `[::]:7888`, identify the specific PID from `ss` and stop only that PID.
  4. Verify the port is clear: `ss -ltnp '( sport = :7888 )' || true`.
  5. Start preview in the background with explicit host/port and a log file: `nohup npm run preview -- --host 0.0.0.0 --port 7888 > /tmp/mojo-vite-preview.log 2>&1 &`.
  6. Wait briefly, then verify it is listening: `sleep 2; ss -ltnp '( sport = :7888 )' || true`.
- Do not use broad process-kill patterns such as `pkill -f "vite preview.*7888"`; they can match the current shell/tool command and hang or terminate the wrong process. Always identify the specific PID from `ss -ltnp '( sport = :7888 )'` and stop only that PID before starting a fresh preview.

## Tooling And Paths
- Import alias `@/*` resolves to the repository root (`./`) in both `tsconfig.json` and `vite.config.ts`.
- Vite injects `process.env.GEMINI_API_KEY`; other client-facing env names are documented in `.env.example`.
- Do not commit local secrets: `.gitignore` ignores `.env*` except `.env.example`.
- Generated/artifact boundaries are `node_modules/`, `dist/`, `build/`, `coverage/`, logs, and `.DS_Store`.

## Runtime Gotchas
- `vite.config.ts` intentionally supports `DISABLE_HMR=true`; keep that HMR/file-watch guard because it prevents flicker in AI Studio-style agent edit environments.
- The app is local-first: Zustand persists app, chat, and FSRS state; `src/services/dictionaryDb.ts` stores dictionary data and AI cache in IndexedDB.
- `src/services/deckApi.ts` imports `sql.js/dist/sql-wasm.wasm?url` for `.apkg` parsing; keep `src/env.d.ts` in sync with Vite asset imports.
- AI providers and QStash/webhook settings are configured in-app via `src/pages/Setup.tsx`; QStash calls currently run from client code in `src/services/notificationService.ts`.
- `src/pages/News.tsx` uses hardcoded mock news content, not a remote feed.
