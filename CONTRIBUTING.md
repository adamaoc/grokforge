# Contributing

Thanks for your interest in GrokForge.

## Before you open a PR

- Read [`AGENTS.md`](AGENTS.md) for architecture, IPC boundaries, and how the main vs renderer processes interact.
- Backlog, stories, bugs, and features are tracked in **TheTaskManager** (`http://localhost:8080/api`, project `grokforge`, prefix `GFAPP`). See the **Task Manager** section in [`AGENTS.md`](AGENTS.md).

## Local checks

From the repo root:

```bash
npm install
npm run typecheck
npm run lint
npm run test
```

Larger changes should also pass `npm run build` (and `npm run test:e2e` when you touch packaging, IPC, or main-process behavior).

## Guidelines

- Prefer **small, focused** PRs with a clear description of what changed and why.
- Match existing **TypeScript strict** style and patterns in nearby files.
- If something is ambiguous, opening an issue first is welcome (not required for tiny fixes).

Maintainers may ask for tests, splits, or follow-ups. If contribution volume ever becomes noisy, this document can be tightened; for now, keep it simple and kind.