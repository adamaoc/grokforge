# 038 — Dependency and runtime compatibility watchlist

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing shared UI primitives or interaction patterns as part of dependency upgrades.

## Why this story exists

GrokForge intentionally uses modern pieces: Electron, electron-vite, React 19, Vite, TypeScript, Tailwind, Monaco, Radix/shadcn-style primitives, and xAI realtime/HTTP APIs. That stack is productive, but some parts are fast-moving or compatibility-sensitive.

React 19 in particular is a reasonable choice, but it is still a newer surface area for libraries like Monaco wrappers, Radix primitives, animation libraries, and Electron renderer tooling. The goal is not to freeze the stack. The goal is to make upgrades boring and catch incompatibilities early.

## Summary

Create a lightweight dependency maintenance practice: document runtime assumptions, add a compatibility checklist, and periodically test upgrades across Electron main/preload/renderer boundaries.

## Goals

- Track compatibility-sensitive packages.
- Make upgrades deliberate instead of accidental.
- Keep Electron, React, Monaco, Vite, and Tailwind working together.
- Ensure security and packaging updates are not ignored.
- Avoid surprise breakage in preload types, renderer aliases, Monaco loading, and production builds.

## Non-goals

- Do not downgrade React solely because it is new.
- Do not pin every dependency forever.
- Do not add heavyweight dependency bots unless the project wants that workflow.
- Do not turn this into broad refactoring.

## Watchlist packages

High attention:

- `electron`
- `electron-vite`
- `vite`
- `react`
- `react-dom`
- `@monaco-editor/react`
- `monaco-editor`
- `framer-motion`
- `@radix-ui/*`
- `tailwindcss`
- `typescript`
- `vitest`
- `ws`
- `zod`
- `react-markdown`
- `rehype-sanitize`

Why these matter:

- Electron upgrades can affect security defaults, permissions, packaging, preload behavior, and native APIs.
- React upgrades can affect rendering semantics and third-party components.
- Monaco upgrades can affect editor workers/bundling.
- Vite/electron-vite upgrades can affect main/preload/renderer build output.
- Markdown/sanitize upgrades affect chat safety.
- `ws` and xAI endpoint behavior affect realtime voice.

## Compatibility checklist

Before or after dependency upgrades, run:

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- manual launch with `npm run dev`
- manual launch of built app with `npm run start`

Manual smoke:

- open/reopen project
- expand file tree
- open Monaco file
- edit/save file
- send mock or real chat message
- preview agent context
- run search
- run harmless terminal command
- open settings
- check voice control renders

When **037** exists, run UI E2E too.

## Runtime assumptions to document

Capture in README or a dedicated maintenance note:

- supported Node version
- supported npm version
- supported macOS/Windows/Linux expectations
- Electron version policy
- whether lockfile updates are expected in every dependency PR
- whether `npm audit` findings are actionable or documented exceptions

## Upgrade policy

Suggested cadence:

- patch updates: opportunistic, after tests
- minor updates: grouped, with smoke testing
- major updates: separate task/story, read changelog first
- Electron major: separate task, include security review
- React major/minor: verify Radix, Monaco, Framer Motion, markdown rendering

## Testing

Add or preserve tests that catch compatibility failures:

- renderer type imports do not pull Node-only code into browser bundle
- preload API shape compiles
- built `dist/main`, `dist/preload`, and `dist/renderer` outputs exist
- Monaco page loads in UI E2E once available
- markdown sanitizer still strips unsafe HTML

## Acceptance criteria

- [ ] Dependency watchlist is documented.
- [ ] Runtime assumptions are written down.
- [ ] Upgrade checklist exists and is referenced from README or AGENTS.
- [ ] Compatibility smoke includes dev and built app launches.
- [ ] Future dependency upgrades have a clear “done” definition.


## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
