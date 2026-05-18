# 028 — Chat: markdown & formatting for agent responses and input

**Status:** Done

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for typography, code blocks, and message bubbles.

## Summary

**Agent responses** (and where appropriate **user input preview** or composer) should render with **proper formatting**: paragraphs, **markdown** (headings, lists, links, **fenced code** with optional syntax highlight), inline code, and basic **GFM** if low cost. Avoid raw wall-of-text for model output.

## Scope

- Choose stack: lightweight markdown + sanitization (e.g. `react-markdown` + `rehype-sanitize` or existing deps if already in tree—**check `package.json` first**).
- Code blocks: monospace, copy affordance optional; theme matches editor / dark UI.
- Links: open external URLs only via **main** `shell.openExternal` + IPC for `https:` (no arbitrary renderer `window.open` for untrusted URLs)—or render links as non-clickable in MVP if simpler.
- User message display: preserve line breaks; optional markdown if product wants parity.

User messages can appear in a bubble like they currently do but responses should look streamed in and part of the pane, not in a bubble.

screenshots:

- the current thread that looks bad:
`/Desktop/our-current-thread.png`

- better look at what a thread could look like:
`/Desktop/a-good-thread.png`

## Acceptance criteria

- [x] Assistant messages render common markdown structures readably and safely (no script injection).
- [x] Long code snippets scroll inside the bubble; UI remains usable.
- [x] Plain text messages still look good (no double-escaping).

## Key files

- Chat rendering components in `src/renderer/src/components/`.
