# GrokForge

**GrokForge** is an **Electron** desktop workspace for a **multi-root** coding agent: chat, optional **Grok Voice** (xAI realtime), Monaco editing, workspace search, git status, and terminals— with project data stored under the app’s **userData**, not inside your source trees.

> [!NOTE]
> GrokForge is an **independent** open source project by [Adam Moore](https://github.com/adamaoc). It uses the **xAI Grok API** for chat, voice, and TTS when you configure a key. **xAI** and **Grok** are trademarks of their respective owners; this project is **not** affiliated with or endorsed by xAI.

## Prerequisites

> [!WARNING]
> **xAI API key:** Chat and voice need a valid key. Use **Settings** in the app (stored with Electron `safeStorage`) or set **`XAI_API_KEY`** / **`GROKFORGE_XAI_API_KEY`** in the environment for local dev (see [`.env.example`](.env.example)). The full key is **never** exposed to the renderer.
>
> **Node.js:** Use **Node 22 LTS** and **npm** with this repo’s `package-lock.json`.

**Supported for development:** macOS is the primary packaging target in scripts (`electron-builder`); Windows/Linux may run from source with the usual Electron caveats.

## Quick start

```bash
git clone https://github.com/adamaoc/grokforge.git
cd grokforge
npm install
npm run dev
```

On the **welcome** screen, start a **new project** by choosing a folder (first workspace root). Reopen saved projects from **Recent projects** (by project id, not path alone).

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | electron-vite dev server + Electron |
| `npm run build` | Production build to `dist/` |
| `npm run start` | Run packaged entry (`electron .`) after a build |
| `npm run preview` | Vite preview |
| `npm run typecheck` | TypeScript `tsc --noEmit` (app + node configs) |
| `npm run lint` | ESLint on `.ts` / `.tsx` |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Build + Vitest smoke (`vitest.e2e.config.ts`) |
| `npm run test:e2e:ui` | Build + Playwright/Electron UI E2E |
| `npm run test:e2e:ui:headed` | Same UI E2E in headed mode |

| `npm run dist` | macOS distributable (electron-builder) |
| `npm run dist:dir` | macOS unpacked dir build |

## Documentation

| Doc | Contents |
|-----|----------|
| [`AGENTS.md`](AGENTS.md) | Architecture, IPC, workspace manifest, keys, terminal vs agent commands, testing commands |
| [`src/main/README.md`](src/main/README.md) | Main-process folder map and naming conventions |

| [`docs/dependency-runtime-watchlist.md`](docs/dependency-runtime-watchlist.md) | Dependency and runtime upgrade notes |
| [`docs/harness-102-xai-investigation.md`](docs/harness-102-xai-investigation.md) | xAI model catalog, redirects, and GrokForge defaults (last reviewed 2026-05-26) |

## Security & keys (short)

- **Main process** owns the xAI API key and all network calls to xAI; the **preload** exposes a fixed API to the **renderer** (`AGENTS.md`).
- **Threat model** (same-user desktop, not a malware sandbox): summarized in **`AGENTS.md`**.
- **Responsible disclosure:** [`SECURITY.md`](SECURITY.md).

## How project data is stored

GrokForge keeps **per-project data** under Electron **`userData`**, not next to your repos:

| Location | Contents |
|----------|----------|
| `userData/workspace-projects/<uuid>/project.json` | Project id, **display name**, **manifest** (models, roots, …) |
| `userData/workspace-projects/<uuid>/chat/thread.jsonl` | Chat thread (JSONL) |
| `userData/recent-projects.json` | Recent projects MRU |

**Deleting a project** in the app removes that app-side storage and MRU entry; it does **not** delete your workspace folders on disk.

## Workspace manifest

The Zod schema lives in **`src/main/project/manifest.ts`**. **`example.grokproject.json`** illustrates the JSON shape of the `manifest` object (GrokForge does **not** write this filename into your trees; it persists manifest inside `project.json` under userData).

## Current status

Early-stage but usable: multi-root UI, agent tool loop with approvals, Monaco diffs for proposed edits, voice pipeline, read-aloud, workspace index, and more. Gaps and future work are tracked in **TheTaskManager** (project `grokforge`; see [`AGENTS.md`](AGENTS.md)).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Adam Moore.
