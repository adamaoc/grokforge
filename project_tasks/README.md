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

**Next up:** MVP **001–080** are complete or **Closed** in the table above. Harness wave **102–114** is complete. Choose next work from GitHub issues, discussion, or a new story file as needed. *(Story **068** hero video / public copy kit remains a **Closed** marketing deliverable—track outside this app repo if you revisit it.)*

---

## Post-MVP backlog

| ID | Story | Spec |
|----|--------|------|
| 018 | ~~Handoff: Grok Build & Grok Computer~~ **(closed)** | [`post-mvp/018-handoff-grok-build-and-grok-computer.md`](post-mvp/018-handoff-grok-build-and-grok-computer.md) |
| 081 | ~~Terminal dock: files pane or bottom drawer~~ **(closed)** | [`post-mvp/081-terminal-dock-files-pane-or-bottom-drawer.md`](post-mvp/081-terminal-dock-files-pane-or-bottom-drawer.md) |
| 082 | Agent edits: require `read_file` before write **(done)** | [`post-mvp/082-agent-edit-require-read-before-write.md`](post-mvp/082-agent-edit-require-read-before-write.md) |
| 083 | Agent edits: minimal-change prompting **(done)** | [`post-mvp/083-agent-edit-prompting-minimal-change.md`](post-mvp/083-agent-edit-prompting-minimal-change.md) |
| 084 | Agent edits: pre-apply safety warnings **(done)** | [`post-mvp/084-agent-edit-pre-apply-safety-warnings.md`](post-mvp/084-agent-edit-pre-apply-safety-warnings.md) |
| 085 | Agent edits: `search_replace` tool **(done)** | [`post-mvp/085-agent-search-replace-tool.md`](post-mvp/085-agent-search-replace-tool.md) |
| 086 | Agent edits: stale content hash **(done)** | [`post-mvp/086-agent-write-stale-content-hash.md`](post-mvp/086-agent-write-stale-content-hash.md) |
| 087 | Agent diff review: hunk-focused UX **(done)** | [`post-mvp/087-agent-diff-hunk-review-ux.md`](post-mvp/087-agent-diff-hunk-review-ux.md) |
| 088 | Agent edits: regenerate proposal **(done)** | [`post-mvp/088-agent-edit-regenerate-proposal.md`](post-mvp/088-agent-edit-regenerate-proposal.md) |
| 089 | ~~Agent edits: Safe vs Power mode~~ **(closed)** | [`post-mvp/089-agent-edit-safe-vs-power-mode.md`](post-mvp/089-agent-edit-safe-vs-power-mode.md) |
| 090 | ~~Agent edits: architecture v2 (epic)~~ **(closed)** | [`post-mvp/090-agent-edit-architecture-v2.md`](post-mvp/090-agent-edit-architecture-v2.md) |
| 091 | Agent proactivity: explore before asking **(done)** | [`post-mvp/091-agent-proactive-workspace-exploration.md`](post-mvp/091-agent-proactive-workspace-exploration.md) |
| 092 | Agent edits: failure self-correction **(done)** | [`post-mvp/092-agent-edit-failure-self-correction.md`](post-mvp/092-agent-edit-failure-self-correction.md) |
| 093 | Agent tool activity in chat thread **(done)** | [`post-mvp/093-agent-tool-activity-in-chat-thread.md`](post-mvp/093-agent-tool-activity-in-chat-thread.md) |
| 094 | Agent context pinning and memory **(done)** | [`post-mvp/094-agent-context-pinning-and-memory.md`](post-mvp/094-agent-context-pinning-and-memory.md) |
| 095 | First project onboarding **(done)** | [`post-mvp/095-first-project-onboarding.md`](post-mvp/095-first-project-onboarding.md) |
| 096 | Applied edit history and revert **(done)** | [`post-mvp/096-applied-edit-history-and-revert.md`](post-mvp/096-applied-edit-history-and-revert.md) |
| 097 | Runner phase routing: planner vs executor intents **(done)** | [`post-mvp/097-model-routing-planner-vs-executor.md`](post-mvp/097-model-routing-planner-vs-executor.md) |
| 098 | Planning mode execute UX polish **(done)** | [`post-mvp/098-planning-mode-execute-ux-polish.md`](post-mvp/098-planning-mode-execute-ux-polish.md) |
| 099 | Plan mode: final contract + missing-plan toast **(done)** | [`post-mvp/099-plan-mode-final-contract-and-toast.md`](post-mvp/099-plan-mode-final-contract-and-toast.md) |
| 100 | Proposal quality: auto-normalize + apply guard **(done)** | [`post-mvp/100-proposal-quality-auto-normalize.md`](post-mvp/100-proposal-quality-auto-normalize.md) |
| 101 | Greenfield plan quality (per-profile prompts) **(done)** | [`post-mvp/101-greenfield-plan-quality.md`](post-mvp/101-greenfield-plan-quality.md) |
| 102 | Dual-model manifest + harness profile keys **(done)** | [`post-mvp/102-dual-model-manifest-and-harness-foundation.md`](post-mvp/102-dual-model-manifest-and-harness-foundation.md) |
| 103 | Per-model harness profiles (`fast` vs `4.3`) **(done)** | [`post-mvp/103-agent-harness-per-model-profiles.md`](post-mvp/103-agent-harness-per-model-profiles.md) |
| 104 | Agent profiles and toolsets **(done)** | [`post-mvp/104-agent-profiles-and-toolsets.md`](post-mvp/104-agent-profiles-and-toolsets.md) |
| 105 | Agent turn snapshots **(done)** | [`post-mvp/105-agent-turn-snapshots.md`](post-mvp/105-agent-turn-snapshots.md) |
| 106 | Unified tool execution context **(done)** | [`post-mvp/106-agent-tool-execution-context.md`](post-mvp/106-agent-tool-execution-context.md) |
| 107 | Context offload for large tool results **(done)** | [`post-mvp/107-agent-context-offload-large-tool-results.md`](post-mvp/107-agent-context-offload-large-tool-results.md) |
| 108 | Harness eval: per-model regressions **(done)** | [`post-mvp/108-harness-eval-suite-per-model-regressions.md`](post-mvp/108-harness-eval-suite-per-model-regressions.md) |
| 109 | RPI plan artifacts on disk **(done)** | [`post-mvp/109-rpi-plan-artifacts-on-disk.md`](post-mvp/109-rpi-plan-artifacts-on-disk.md) |
| 110 | Interrupted tool boundaries + turn receipts **(done)** | [`post-mvp/110-agent-interrupted-tool-boundaries.md`](post-mvp/110-agent-interrupted-tool-boundaries.md) |
| 111 | Harness roadmap + retrospective doc **(done)** | [`post-mvp/111-harness-roadmap-and-retrospective-doc.md`](post-mvp/111-harness-roadmap-and-retrospective-doc.md) |
| 112 | Subagents as child sessions **(done)** | [`post-mvp/112-agent-subagents-child-sessions.md`](post-mvp/112-agent-subagents-child-sessions.md) |
| 113 | Voice realtime harness alignment **(done)** | [`post-mvp/113-voice-realtime-harness-profile-alignment.md`](post-mvp/113-voice-realtime-harness-profile-alignment.md) |
| 114 | Deprecate fenced `grokforge-agent-tools` protocol **(done)** | [`post-mvp/114-deprecate-fenced-agent-tools-protocol.md`](post-mvp/114-deprecate-fenced-agent-tools-protocol.md) |
| 115 | Edit cascade guard after search_replace failures **(done)** | [`post-mvp/115-agent-edit-cascade-guard-after-search-replace-failures.md`](post-mvp/115-agent-edit-cascade-guard-after-search-replace-failures.md) |
| 116 | Search_replace failure escalation nudge **(done)** | [`post-mvp/116-agent-edit-search-replace-escalation-nudge.md`](post-mvp/116-agent-edit-search-replace-escalation-nudge.md) |
| 117 | Renderer black screen on macOS resume (stability) | [`post-mvp/117-renderer-black-screen-on-macos-resume.md`](post-mvp/117-renderer-black-screen-on-macos-resume.md) |
| 118 | Work vs Plan, trust/velocity temperament, plan lifecycle **(done)** | [`post-mvp/118-work-vs-plan-mode-and-conversation-lifecycle.md`](post-mvp/118-work-vs-plan-mode-and-conversation-lifecycle.md) |
| 119 | Agent turn UI honesty and activity compaction **(done)** | [`post-mvp/119-agent-turn-ui-honesty-and-activity-compaction.md`](post-mvp/119-agent-turn-ui-honesty-and-activity-compaction.md) |
| 120 | Post-plan executor routing and single-file edit bias **(done)** | [`post-mvp/120-post-plan-executor-routing-and-single-file-edits.md`](post-mvp/120-post-plan-executor-routing-and-single-file-edits.md) |
| 121 | xAI model catalog and API sync (Grok Build 0.1, Voice) **(done)** | [`post-mvp/121-xai-model-catalog-and-api-sync.md`](post-mvp/121-xai-model-catalog-and-api-sync.md) |
| 122 | Dynamic xAI model catalog + Settings picker | [`post-mvp/122-dynamic-xai-model-catalog-and-settings-picker.md`](post-mvp/122-dynamic-xai-model-catalog-and-settings-picker.md) |
| 123 | Plan execute review follow-ups **(done)** | [`post-mvp/123-plan-execute-review-follow-ups.md`](post-mvp/123-plan-execute-review-follow-ups.md) |
| 124 | Greenfield executor code quality and proposal recovery (Phase A) **(done)** | [`post-mvp/124-greenfield-executor-code-quality-and-proposal-recovery.md`](post-mvp/124-greenfield-executor-code-quality-and-proposal-recovery.md) |
| 125 | Agent turn activity clarity and chat vertical space (Phase B) **(done)** | [`post-mvp/125-agent-turn-activity-clarity-and-chat-vertical-space.md`](post-mvp/125-agent-turn-activity-clarity-and-chat-vertical-space.md) |
| 126 | Agent terminal command execution (safe, reviewable) **(done)** | [`post-mvp/126-agent-terminal-command-execution.md`](post-mvp/126-agent-terminal-command-execution.md) |
| 127 | Greenfield project scaffolding and initialization **(done)** | [`post-mvp/127-greenfield-project-scaffolding-and-initialization.md`](post-mvp/127-greenfield-project-scaffolding-and-initialization.md) |
| 128 | Greenfield scaffold strategy routing (CLI vs file-first) **(done)** | [`post-mvp/128-greenfield-scaffold-strategy-routing.md`](post-mvp/128-greenfield-scaffold-strategy-routing.md) |
| 129 | Iterative work stability (populated workspaces) **(done)** | [`post-mvp/129-iterative-work-stability-populated-workspaces.md`](post-mvp/129-iterative-work-stability-populated-workspaces.md) |
| 130 | Work iterative edit harness (non-greenfield stability) **(done)** | [`post-mvp/130-work-iterative-edit-harness.md`](post-mvp/130-work-iterative-edit-harness.md) |
| 131 | Greenfield scaffold conflict warning hygiene (file-bootstrap false positives) **(done)** | [`post-mvp/131-greenfield-scaffold-conflict-warning-hygiene.md`](post-mvp/131-greenfield-scaffold-conflict-warning-hygiene.md) |
| 132 | Greenfield plan verification commands (static + npm) **(done)** | [`post-mvp/132-greenfield-plan-verification-commands.md`](post-mvp/132-greenfield-plan-verification-commands.md) |
| 133 | Greenfield execute quality regression guard (Plan → Execute) **(done)** | [`post-mvp/133-greenfield-execute-quality-regression-guard.md`](post-mvp/133-greenfield-execute-quality-regression-guard.md) |
| 134 | Harness conflict recovery activity honesty **(done)** | [`post-mvp/134-harness-conflict-recovery-activity-honesty.md`](post-mvp/134-harness-conflict-recovery-activity-honesty.md) |
| 135 | Iterative Work surgical edit enforcement (low-round, one proposal) **(done)** | [`post-mvp/135-iterative-work-surgical-edit-enforcement.md`](post-mvp/135-iterative-work-surgical-edit-enforcement.md) |
| 136 | Iterative edit scope and combine heuristics **(done)** | [`post-mvp/136-iterative-edit-scope-and-combine-heuristics.md`](post-mvp/136-iterative-edit-scope-and-combine-heuristics.md) |
| 137 | Iterative Work edit harness observability **(done)** | [`post-mvp/137-iterative-work-edit-harness-observability.md`](post-mvp/137-iterative-work-edit-harness-observability.md) |
| 138 | Iterative Work search_replace escalation (fail fast, switch strategy) **(done)** | [`post-mvp/138-iterative-work-search-replace-escalation.md`](post-mvp/138-iterative-work-search-replace-escalation.md) |
| 139 | Iterative Work search_replace quality guidance (first-attempt success) **(done)** | [`post-mvp/139-iterative-work-search-replace-quality-guidance.md`](post-mvp/139-iterative-work-search-replace-quality-guidance.md) |
| 140 | search_replace failure loop observability **(done)** | [`post-mvp/140-search-replace-failure-loop-observability.md`](post-mvp/140-search-replace-failure-loop-observability.md) |
| 141 | Conversation-first chat layout and tool activity shell **(done)** | [`post-mvp/141-conversation-first-chat-and-tool-activity-shell.md`](post-mvp/141-conversation-first-chat-and-tool-activity-shell.md) |
| 142 | UI copy and status hierarchy cleanup **(done)** | [`post-mvp/142-ui-copy-and-status-hierarchy-cleanup.md`](post-mvp/142-ui-copy-and-status-hierarchy-cleanup.md) |
| 143 | Context panel: agent-aware file companion **(done)** | [`post-mvp/143-context-panel-agent-companion.md`](post-mvp/143-context-panel-agent-companion.md) |
| 144 | Consolidate incremental Work edit policy **(done)** | [`post-mvp/144-consolidate-incremental-work-edit-policy.md`](post-mvp/144-consolidate-incremental-work-edit-policy.md) |
| 145 | Intermittent plan not appearing in UI until project restart | [`post-mvp/145-plan-ui-state-sync-after-execute.md`](post-mvp/145-plan-ui-state-sync-after-execute.md) |

**Suggested backlog order (harness program — dual-model `grok-code-fast-1` + `grok-4.3`):**

**Wave 1 — foundation & RPI feel**

1. ~~**111**~~ (docs index) → ~~**102**~~ → ~~**103**~~ → ~~**104**~~ → ~~**097**~~ → ~~**101**~~ → ~~**098**~~

**Wave 2 — harness hardening**

2. ~~**108**~~ (parallel after **103**) → ~~**105**~~ → ~~**106**~~ → ~~**107**~~ → ~~**110**~~

**Wave 3 — durability & cleanup**

3. ~~**109**~~ → ~~**112**~~ → ~~**113**~~ → ~~**114**~~

**Parallel (not harness-core):** ~~**081**~~ terminal dock **(closed)**.

**UX / harness polish (post-116):** ~~**118**~~ Work/Plan + trust vs velocity **(done)**; ~~**120**~~ post-plan executor routing **(done)**; ~~**119**~~ activity honesty **(done)**; ~~**124**~~ greenfield JS/proposal recovery (Phase A) **(done)**; ~~**125**~~ chat spinners + vertical space (Phase B) **(done)**. **117** renderer stability if reproducible.

**xAI catalog sync:** ~~**121**~~ Grok Build 0.1 / Grok 4.3 reasoning / Voice defaults — do before large harness changes that assume old redirect behavior. **122** dynamic model list + Settings pickers (after **121**; reduces need for app releases when xAI ships new ids e.g. Grok 5.0).

**Greenfield / CLI (next):** ~~**126**~~ agent terminal command execution **(done)** → ~~**127**~~ project scaffolding and init **(done)** → ~~**128**~~ scaffold strategy routing **(done)** → ~~**131**~~ scaffold conflict warning hygiene **(done)** → ~~**132**~~ plan verification commands **(done)** → ~~**133**~~ execute quality eval guard **(done)** → ~~**134**~~ conflict recovery activity honesty **(done)**.

**Iterative Work (next):** ~~**130**~~ Work iterative edit harness **(done)** → ~~**135**~~ surgical edit enforcement **(done)** → ~~**136**~~ scope/combine heuristics **(done)** → ~~**137**~~ harness observability **(done)** → ~~**138**~~ S&R escalation **(done)** → ~~**139**~~ S&R first-attempt quality **(done)** → ~~**140**~~ S&R failure observability **(done)**.

**UI/UX — conversation-first:** ~~**141**~~ chat vertical space + collapsible tool activity **(done)** → ~~**142**~~ copy and status hierarchy **(done)** → ~~**143**~~ context panel companion **(done)**. Builds on ~~**125**~~ / ~~**119**~~ activity work **(done)**.

*Last progress update: **2026-05-27** — **145** backlog: intermittent plan UI state sync after execute (disk correct, renderer stale until project reload).*
