# Completed Review Items

## P1 Writing evaluation can discard unsaved content

- Location: `src/pages/Writing.tsx`
- Status: fixed. Evaluation now persists `content: text` and uses the same title derivation path as manual save.

## P2 Generated writing topics can create duplicate drafts in development

- Location: `src/pages/Writing.tsx`
- Status: fixed. Incoming topic requests are consumed once per topic/source payload to avoid StrictMode duplicate drafts.

## P2 Assistant schedules are persisted before remote scheduling succeeds

- Location: `src/components/ChatAssistant.tsx`
- Status: fixed. The `Schedule` tool now persists locally only after QStash scheduling succeeds.

## P2 Assistant memory tools read stale state inside multi-tool rounds

- Location: `src/components/ChatAssistant.tsx`
- Status: fixed. Memory list/read/update now read `useAppStore.getState().assistantMemories` at execution time.

## Confirmed product decisions

- Daily goal remains global across wordbooks.
- News completion remains tied to short-answer submission.
- News source blacklisting threshold is five consecutive failures.
