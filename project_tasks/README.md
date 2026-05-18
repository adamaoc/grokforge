# GrokForge — `project_tasks`

Numbered stories in this folder describe MVP work in **implementation order**. Each file is self-contained. **Post-MVP** specs that are out of the MVP sequence live in [`post-mvp/`](post-mvp/).

For a lightweight local overview with expandable full story text, run **`npm run stories:html`** and open [`stories.html`](stories.html).

**Design & components (always):** Before implementing a story, read the Cursor project skill **`styleguide-design`**:

- Path: `.cursor/skills/styleguide-design/SKILL.md`
- In chat: reference `@styleguide-design` (or your client’s equivalent) so the agent loads the skill.

Stories **001–003** establish UI foundations; **004+** build product behavior on top.

There is **no story 076** in this queue (number skipped by historical bookkeeping).

### Story file convention (`NNN-*.md`)

Each numbered story file should lead with:

- **`Status:`** — **`Done`**, **`Closed`**, or **`Not started`** (wording must match the [progress table](#progress-update-when-a-story-ships) below so `npm run stories:html` stays accurate).
- **`Design skill:`** — **`N/A`** for main-only / docs-only work, or a pointer to **`styleguide-design`** when changing renderer UI.

End the file with **`## Completion bookkeeping`** reminding editors to update this **`README.md`** table and run **`npm run stories:html`** after the story ships.

**Automated tests:** `npm run test` (Vitest unit). **`npm run test:e2e`** (019) runs **`npm run build`** then Vitest smoke tests in `e2e/` (`vitest.e2e.config.ts`).

---

## Progress (update when a story ships)

| ID | Story | Status |
|----|--------|--------|
| 001 | Design tokens & Tailwind theme | **Done** |
| 002 | shadcn/ui baseline | **Done** |
| 003 | Shared components & small-file structure | **Done** |
| 004 | IPC: project root & manifest save | **Done** |
| 005 | Real filesystem: directory IPC & FileTree | **Done** |
| 006 | Manifest ignore glob filtering | **Done** |
| 007 | Editor polish: keyboard, dirty state, close guard | **Done** |
| 008 | Manifest context resolution | **Done** |
| 009 | Grok text API client | **Done** |
| 010 | Wire chat thread to Grok client | **Done** |
| 011 | Persist chat threads per project | **Done** |
| 012 | Model routing service | **Done** |
| 013 | Voice full-duplex pipeline | **Done** |
| 014 | Monaco diff & multi-root grouping | **Done** |
| 015 | Git status per root | **Done** |
| 016 | Search across roots | **Done** |
| 017 | Terminal shell execution | **Done** |
| 019 | QA: E2E & accessibility pass | **Done** |
| 020 | Recent projects & project picker cards | **Done** |
| 021 | Header chrome: minimal branding | **Done** |
| 022 | macOS title bar: drag region & zoom | **Done** |
| 023 | Sidebar: file tree full height | **Done** |
| 024 | Resizable layout panes (shadcn) | **Done** |
| 025 | UI controls inventory: wire, hide, or disable | **Done** |
| 026 | Voice session reliability & verification | **Done** |
| 027 | Read aloud: agent chat responses | **Done** |
| 028 | Chat: markdown & formatting | **Done** |
| 029 | Settings: xAI API key (not env-only) | **Done** |
| 030 | Remove from recent projects (picker) | **Done** |
| 031 | Git status: refresh, errors, discoverability | **Done** |
| 032 | "About GrokForge" menu item: define & wire | **Done** |
| 033 | Rename project: manifest + workspace UI | **Done** |
| 034 | Agent tool loop & workspace intelligence | **Done** |
| 035 | Agent reliability and voice alignment checkpoint | **Done** |
| 036 | Terminal policy: docs, behavior, and threat model alignment | **Closed** |
| 037 | Playwright + Electron UI E2E harness | **Done** |
| 038 | Dependency and runtime compatibility watchlist | **Done** |
| 039 | Context budget and retrieval governance | **Done** |
| 040 | Preload API contract cleanup and type audit | **Done** |
| 041 | File tree UX and accessibility polish | **Done** |
| 042 | File tree and editor state synchronization | **Done** |
| 043 | File tree code architecture cleanup | **Done** |
| 044 | Filesystem mutation safety and semantics | **Done** |
| 045 | Real diff model and open-diff API | **Done** |
| 046 | Agent proposed edits diff review | **Done** |
| 047 | Diff apply/discard and conflict safety | **Done** |
| 048 | Git diff viewer | **Done** |
| 049 | Diff system cleanup: remove demo stubs and align docs | **Done** |
| 050 | Real terminal PTY foundation | **Done** |
| 051 | Terminal emulator renderer with xterm.js | **Done** |
| 052 | Terminal tabs, layout, and session UX | **Done** |
| 053 | Terminal safety policy and agent boundaries | **Done** |
| 054 | Terminal shell integration and polish | **Done** |
| 055 | Retire command runner or reframe it as task runner | **Done** |
| 056 | Dashboard review and project picker redesign plan | **Done** |
| 057 | Agent retrieval and project intelligence V2 | **Done** |
| 058 | Agent context attachments and editor selection workflow | **Done** |
| 059 | Agent command tool approvals | **Done** |
| 060 | Agent first-class edit proposals | **Done** |
| 061 | Agent debugging, telemetry, and turn replay | **Done** |
| 062 | Agent planning and multi-step workflow | **Done** |
| 063 | Agent evaluation suite and smartness regressions | **Done** |
| 064 | Launch polish: welcome empty state and command affordances | **Done** |
| 065 | Launch polish: agent thread context and model visibility | **Done** |
| 066 | Launch polish: loading and project transition states | **Done** |
| 067 | Launch polish: settings theme preview | **Done** |
| 068 | Launch asset: hero video and public copy kit | **Closed** |
| 069 | Plan approve → auto agent turn (062 follow-up, Option B) | **Done** |
| 070 | Background agent chat and dashboard activity | **Done** |
| 071 | Chat thread scroll restore per project | **Done** (v1: bottom on open) |
| 072 | Chat composer auto-grow and word wrap | **Done** |
| 073 | Chat attachments: uploads and file tree add to chat | **Done** |
| 074 | Chat header removal or relocation | **Done** (v1: header removed; model + thread menu in composer strip) |
| 075 | Files pane collapse defaults and file tree default open | **Done** (v1: collapsible editor + context bubble + empty state shortcuts) |
| 077 | Voice agent chat: polish, handoff, thread continuity | **Done** (v1: handoff button, coalesced partials, voice hydration) |
| 078 | Assistant message actions: single-row density | **Done** (v1: single-row footer + truncation + 40px actions) |
| 079 | Open source prep: security review and README | **Done** |
| 080 | Open source prep: stories and tasks hygiene | **Done** |

**Next up:** MVP **001–080** are complete or **Closed** in the table above. Further product ideas live in **[`post-mvp/`](post-mvp/)** (for example **018** handoff flows, **081** terminal dock). Choose next work from GitHub issues, discussion, or a new story file as needed. *(Story **068** hero video / public copy kit remains a **Closed** marketing deliverable—track outside this app repo if you revisit it.)*

---

## Post-MVP backlog

| ID | Story | Spec |
|----|--------|------|
| 018 | Handoff: Grok Build & Grok Computer | [`post-mvp/018-handoff-grok-build-and-grok-computer.md`](post-mvp/018-handoff-grok-build-and-grok-computer.md) |
| 081 | Terminal dock: files pane or bottom drawer | [`post-mvp/081-terminal-dock-files-pane-or-bottom-drawer.md`](post-mvp/081-terminal-dock-files-pane-or-bottom-drawer.md) |

*Last progress update: **2026-05-18** — **080** stories/tasks hygiene (README convention, completion footers, `stories.html`). MVP queue **001–080** complete for public OSS baseline.*
