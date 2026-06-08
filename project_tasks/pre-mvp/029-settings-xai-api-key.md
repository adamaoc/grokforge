# 029 — Settings: xAI API key (not env-only)

**Status:** Done

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for settings layout, forms, and sensitive field patterns.

## Summary

The Grok / xAI API key today is expected via **environment variables** (`XAI_API_KEY` / `GROKFORGE_XAI_API_KEY`). For a desktop app, users expect a **Settings** screen to **set or update the key**, stored securely-ish on disk (OS user scope) and loaded by **main** only—**never** expose the raw key to the renderer beyond masked input.

## Scope

- **Settings** route or modal: field for API key (password type), mask on load, “Save”, optional “Delete key”.
- Main process: read/write key store (e.g. `safeStorage` / `keytar` / encrypted file—**pick one** compatible with Electron 35; document threat model: local user account compromise = key readable).
- Resolution order: e.g. **user setting overrides env** for chat + voice, or env wins—**document in AGENTS.md** once decided.
- Migration note for devs who already use `.env`.

## Acceptance criteria

- [x] User can paste a key in Settings, save, and chat/voice works without exporting shell env (on supported OS).
- [x] Key is not logged; not returned in full to renderer after save (mask only).
- [x] Clear empty state when no key: link or copy points to xAI docs / account.

## Key files

- `src/main/main.ts` (or new `secrets-store.ts`), preload IPC (narrow API), new settings UI in renderer.

## Notes

- Coordinate with **025** if settings entry lives in a menu that was previously inert.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
