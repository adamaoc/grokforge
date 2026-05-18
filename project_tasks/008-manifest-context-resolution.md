# 008 — Resolve manifest context: `alwaysInclude`, instructions, multi-root paths

**Design skill:** Minimal; any settings UI later should follow skill.

## Summary

Build a **context bundle** service (main or renderer + main FS) that, given `GrokProjectManifest`, resolves:

- `context.alwaysInclude[]` paths relative to the correct **root** (define resolution: try each root prefix, or require root-qualified paths—pick one, document).
- `context.customInstructions` string.
- `context.customInstructionsFile` → read UTF-8 text from disk if present; cap size (e.g. 64KB) with truncation log.

## Scope

- Pure logic + IPC: e.g. `get-agent-context-preview` returning serializable bundle for UI/debug and for future Grok client.
- Handle missing files gracefully (empty string + optional warning array).

## Acceptance criteria

- [x] Example manifest like the product spec loads all three context sources without throwing.
- [x] Zod schema in `manifest.ts` stays aligned; add tests or runtime checks for new edge cases.
- [x] No path reads outside manifest roots + `projectRootPath` from **004**.

## Key files

- `src/main/manifest.ts`, new `src/main/context.ts` (or similar), `main.ts`, preload, optional dev panel in renderer.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
