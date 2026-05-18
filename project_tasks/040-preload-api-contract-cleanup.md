# 040 — Preload API contract cleanup and type audit

**Design skill (required):** Minimal. Only read `.cursor/skills/styleguide-design/SKILL.md` if this story expands into renderer UI changes; the expected work is preload/shared-type cleanup.

## Why this story exists

While implementing **032 — About GrokForge**, the preload API surface showed an oddity around the `updateRecentPickerName` function signature: `projectId` appears duplicated in the source snippet, yet `npm run typecheck`, `npm run test`, and `npm run build` all pass. That means either the code is syntactically valid in the actual file after TypeScript parsing, the displayed snippet is misleading due to surrounding formatting, or there is a nearby type/API cleanliness issue that deserves a focused audit.

This was not addressed in 032 because it was unrelated to the About modal and should not be mixed into a small feature task.

## Summary

Audit the renderer-facing preload API contract for accidental duplication, stale signatures, overly loose return types, and imports that drift from shared contracts. Clean up anything harmless-but-confusing, and add lightweight compile/runtime checks where useful.

## Scope

- Inspect `src/preload/preload.ts` for:
  - duplicated parameters or copy/paste artifacts
  - inconsistent Promise return types
  - APIs returning `any` where a shared contract exists
  - stale comments from earlier stories
  - accidental ordering/grouping that makes the bridge hard to scan
- Inspect `src/renderer/src/types.ts` for:
  - re-export drift
  - type imports from main-process modules that should move to `src/shared`
  - values imported into the renderer from Node-adjacent modules
- Inspect the global `Window.electron` declaration:
  - make sure the renderer sees the exact `electronAPI` shape
  - confirm no capability exists in preload that renderer types hide, or vice versa
- Decide whether app-info, git-status, chat-store, manifest, and context types should remain where they are or move toward shared contracts.

## Non-goals

- Do not redesign IPC.
- Do not change user-visible behavior unless a bug is found.
- Do not move every type to `src/shared` in one sweep; prefer targeted cleanup.
- Do not touch security defaults (`contextIsolation`, `nodeIntegration`) except to verify them.

## Investigation questions

1. Is the apparent duplicated `projectId` in `updateRecentPickerName` real in the current file?
2. If real, why did TypeScript accept it?
3. Are there other preload API methods with weak or inconsistent types?
4. Are renderer imports from `src/main/*` safe today because they are type-only, or are any runtime imports leaking Node-only modules into the browser bundle?
5. Should `AppInfoPayload` become the model for future IPC contracts: small DTO in `src/shared`, imported by main/preload/renderer?

## Suggested cleanup

- Normalize `electronAPI` method signatures to one line per capability where practical.
- Prefer shared DTO files under `src/shared` for new IPC contracts.
- Keep type-only imports explicit with `import type`.
- Add comments only where the security boundary matters.
- If a preload method is unused, either document why it exists or remove it in a separate tiny change.

## Testing

- `npm run typecheck`
- `npm run test`
- `npm run build`

Optional targeted checks:

- Add a small type-level test or compile-only assertion if there is a safe local pattern for verifying the preload API shape.
- Run `rg "from '../../main"` in renderer and classify imports as type-only vs runtime.

## Acceptance criteria

- [x] The `updateRecentPickerName` signature is confirmed clean or fixed.
- [x] Preload API methods have explicit, consistent return types.
- [x] Renderer-facing DTOs are shared where it matters.
- [x] No runtime renderer import pulls Node-only main-process code.
- [x] Findings are documented in this story’s implementation notes.

## Implementation notes

- The apparent duplicated `projectId` parameter in `updateRecentPickerName` was not present in the current `src/preload/preload.ts`; the method signature is clean.
- Added `src/shared/preload-api-contract.ts` as the explicit renderer-facing `ElectronAPI` contract. `src/preload/preload.ts` now uses `satisfies ElectronAPI`, and `Window.electron` is declared as that shared contract.
- Tightened loose preload return types for `readFile`, `writeFile`, `listRoots`, and `agentToolBatch`.
- Added `src/preload/preload-api-contract.test.ts`, a compile-time shape assertion that the preload implementation and shared contract match.
- Moved runtime-safe model routing to `src/shared/model-router.ts`; `src/main/model-router.ts` now re-exports it for main-side compatibility. This removes the renderer’s runtime import from `src/main/model-router.ts`.
- Remaining renderer imports from `src/main/*` in `src/renderer/src/types.ts` are type-only DTO imports. They do not pull Node-only code into the renderer bundle today; future IPC DTOs should prefer `src/shared/*` contracts.
