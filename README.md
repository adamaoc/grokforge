# GrokForge

**GrokForge** is an **Electron** desktop workspace for a **multi-root** coding agent: chat, optional **Grok Voice** (xAI realtime), Monaco editing, workspace search, git status, and terminals— with project data stored under the app’s **userData**, not inside your source trees.

Chat turns run on a coding agent you **already have installed and signed in to** — **Grok Build** (`grok`, SuperGrok / X Premium+) or **Claude Code** (`claude`, Claude Pro / Max) — so you use your existing subscription instead of paying per API token. GrokForge talks to them over the [Agent Client Protocol](https://agentclientprotocol.com) and keeps edits reviewable. See [`docs/coding-agents.md`](docs/coding-agents.md).

> [!NOTE]
> GrokForge is an **independent** open source project by [Adam Moore](https://github.com/adamaoc). It uses the **xAI Grok API** for chat, voice, and TTS when you configure a key. **xAI**, **Grok**, **Anthropic**, and **Claude** are trademarks of their respective owners; this project is **not** affiliated with or endorsed by xAI or Anthropic.

## Prerequisites

> [!WARNING]
> **Coding agent:** Install and sign in to at least one of `grok` ([Grok Build](https://x.ai/cli), then `grok login`) or `claude` ([Claude Code](https://docs.anthropic.com/en/docs/claude-code), then `/login`). Pick one in **Settings → Coding agent**.
>
> **xAI API key (optional):** Only needed for Grok Voice / read-aloud and the legacy built-in Grok API chat harness. Use **Settings** in the app (stored with Electron `safeStorage`) or set **`XAI_API_KEY`** / **`GROKFORGE_XAI_API_KEY`** in the environment for local dev (see [`.env.example`](.env.example)). The full key is **never** exposed to the renderer.
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
| [`docs/coding-agents.md`](docs/coding-agents.md) | Grok Build / Claude Code over ACP: providers, review model, known gaps |
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

Early-stage. Chat now runs on **Grok Build** or **Claude Code** through your own subscription (spike: see [`docs/coding-agents.md`](docs/coding-agents.md)), with the multi-root UI, diff review, terminal, git, and voice around it. The original built-in Grok API harness is still available as a legacy option.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Adam Moore.
