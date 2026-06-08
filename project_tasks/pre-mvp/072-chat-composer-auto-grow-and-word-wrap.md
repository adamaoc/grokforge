# 072 — Chat composer auto-grow and word wrap

**Status:** Done (CSS `field-sizing: content` + `textarea`, max height + internal scroll; Chromium 123+).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing composer layout, tokens, or focus rings (`@styleguide-design`).

## Why this story exists

The chat **composer** behaves like a **single short line** for many messages: long text does not **wrap** visibly and the field does not **grow vertically** with content. That makes drafting multi-line prompts (paths, diffs, bullet lists) uncomfortable compared to Cursor-style chat inputs.

## Goals

1. **Word wrap** inside the composer for long lines (no horizontal overflow for normal ASCII width).
2. **Auto-grow** height from **one line** up to a **max height** (e.g. 6–10 lines or ~40vh), then **internal scroll** for the textarea.
3. Preserve **Enter to send** vs **Shift+Enter** newline semantics already in `ChatThread` (verify and document).
4. **Accessible** focus: composer remains keyboard navigable; do not trap screen reader users in a shrinking/growing region without stable labels.

## Scope

### Renderer

- **`src/renderer/src/components/ChatThread.tsx`** (or extracted **`ChatComposer.tsx`** if refactor helps): replace or augment `<textarea>` styling.
- Techniques: **`rows={1}`** + CSS `field-sizing: content` (where supported) with fallback; or **mirror div** measurement; or small dependency if project already allows it (prefer no new deps unless justified).
- **Min/max height** constants colocated with design tokens from `index.css` / Tailwind.

### Layout interaction

- Composer growth must not **cover** the last assistant message: the **messages pane** should shrink or scroll so the overall **chat column** layout stays balanced (coordinate with **075** if files pane defaults change vertical space).

## UX direction

- Smooth height transitions optional; if used, respect **`prefers-reduced-motion`**.
- Placeholder and attachment chips remain visible as height grows.

## Testing

- Manual: paste 2k character paragraph → wraps, grows, then scrolls inside composer at cap.
- Manual: narrow window width → still wraps.
- **`npm run typecheck`**.

## Acceptance criteria

- [x] Long single-line user input **wraps** within the composer width.
- [x] Composer **grows vertically** with content up to a defined **maximum**, then scrolls internally.
- [x] Newline / send keyboard behavior remains **predictable** and matches prior semantics (or document intentional change).
- [x] `npm run typecheck` passes.

## Implemented

- **`index.css`:** `textarea.gf-chat-composer` — `field-sizing: content`, `min-block-size: 2.75rem`, `max-block-size: min(40vh, 10rem)`, `white-space: pre-wrap`, `word-break: break-word`, internal `overflow-y: auto` + horizontal clip.
- **`ChatThread.tsx`:** Replaced single-line `Input` with **`rows={1}`** `textarea` using that class; **Enter** sends, **Shift+Enter** newline (unchanged logic); send control **bottom-right**; tooltip documents both shortcuts; `aria-label` on the field.

## Related stories

- **[071](071-chat-scroll-restore-per-project.md)** — scroll metrics interact with composer height.
- **[073](073-chat-attachments-uploads-and-file-tree-add-to-chat.md)** — attachment row height + composer growth must compose cleanly.

## Completion bookkeeping

When done: mark **072** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
