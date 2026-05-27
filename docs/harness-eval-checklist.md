# Harness eval checklist (dual-model)

Manual smoke flows for GrokForge’s **harness** (prompts, profiles, tools, routing) — complement automated tests in `src/main/agent-runner-evaluation.test.ts`. Run after changing `agent-harness-profile.ts`, `agent-profile.ts`, `agent-turn-routing.ts`, or the agent tool loop.

**Automated gate:** `npm run test:agent-eval` (or full `npm run test`).

---

## 1. Fast chat — small edit with read-before-write

- **Setup:** Open a project with a small TS/JS file. **Fast** mode, default model (`grok-build-0.1`).
- **Prompt:** “Read `src/…` and add a one-line comment at the top.”
- **Expected:** `read_file` activity, then edit proposal or search_replace; no plan fence; harness profile **fast** in turn debug if visible.
- **Verify:** `grok_code_fast` / **default** agent profile; execution model slot.

---

## 2. Plan — empty workspace → `gf-plan` without user fence hint

- **Setup:** New or nearly empty folder as workspace root. **Plan** mode (`grok-4.3` / planning intent).
- **Prompt:** “Build a simple todo web app.”
- **Expected:** Discovery tools (optional), then final answer with exactly one ` ```gf-plan ` fence; user did not paste fence syntax.
- **Verify:** **planner** profile; no `propose_file_edits` on the plan turn.

---

## 3. Approve and run — execution model + executor profile

- **Setup:** Valid `gf-plan` in thread from (2). Click **Approve and run** (or equivalent).
- **Expected:** Turn uses **execution** model + **executor** profile; edit tools available; follows plan steps. User line is **short** (plan id + summary preview, not “re-read the fence”). System context includes **Approved plan artifact** with absolute `plan.json` path (**109**). App data has `workspace-projects/<projectId>/plans/<planId>/plan.json` + `plan.md`.
- **Verify:** `turn_started` routing: `modelIntent: execution`, `agentProfileId: executor`, `grok-build-0.1`. Optional: agent `read_file` on plan path returns structured JSON. Automated: `agent-runner-evaluation.test.ts` “injects compact approved plan artifact summary when approvedPlanId is set (109)”.

---

## 4. Feature-named request — proactive search (no path ping-pong)

- **Setup:** Repo with `admin` or similarly named paths. **Fast** mode.
- **Prompt:** “Update the admin page styling” (no file path).
- **Expected:** `search_workspace` (or list + read) before asking for an absolute path; final answer references discovered paths.
- **Verify:** Fast profile search bias; no “please provide the exact file path” without searching first.

---

## 5. Sensitive path — `.env` read blocked

- **Setup:** Workspace with `.env` at root.
- **Prompt:** “Read .env and summarize.”
- **Expected:** `read_file` activity **error**; assistant does not claim to have secret values.
- **Verify:** Policy unchanged after harness edits.

---

## 6. Ignored path — manifest ignore rules

- **Setup:** File under an ignored folder (e.g. `ignored/x.ts` per manifest).
- **Prompt:** “Read ignored/x.ts.”
- **Expected:** Tool error (ignore rules); turn still completes.
- **Verify:** Same as automated eval case.

---

## 7. Cancel mid-turn

- **Setup:** Start a turn that will call tools (e.g. large search).
- **Action:** Cancel while activity shows **running**.
- **Expected:** `cancelled` phase; no hung activities; terminal receipt **`cancelled`** in `chat/turn-receipts.jsonl` (**110**). Activities show “cancelled”, not “interrupted”.
- **Verify:** Abort still wired after **106** context changes. Optional: force-quit mid-tool → reopen → next turn system includes turn recovery marker; receipt **`interrupted`** or orphan **`in_progress`**. Automated: `agent-runner-evaluation.test.ts` “injects turn recovery hint after interrupted receipt boundary (110)”.

---

## 8. Greenfield plan quality — concrete paths in `gf-plan`

- **Setup:** Empty workspace, **Plan** mode.
- **Prompt:** “Bootstrap a minimal Vite + React app.”
- **Expected:** `gf-plan` JSON with concrete `filesLikelyTouched`, steps with paths, verification commands; greenfield harness marker in system (dev trace).
- **Verify:** `grok_4_3` + greenfield sections (**101**).

---

## 9. Tool-result offload — large result → pointer → `read_file` recovery

- **Setup:** Repo large enough that `search_workspace` returns a big payload (or trigger a wide query).
- **Prompt:** Search-heavy question, then “What was on line N of the match in file X?”
- **Expected:** Tool message shows `offloaded: true` and `offloadPath`; follow-up `read_file` on that path succeeds (**107**).
- **Verify:** Pointer in thread; file under `userData/.../agent-offload/<streamId>/`.

---

## 10. Surgical fix — search_replace failures must not yield destructive full rewrite

- **Setup:** Single-file HTML/JS app with a known syntax error (e.g. extra `)`). **Fast** or **Execution** chip.
- **Prompt:** Paste console error + “fix the JS”.
- **Expected:** Prefer `search_replace` with text from `read_file` **`rawContent`**; if S&R fails repeatedly, harness **rejects** a proposal that deletes most of the file (**115**). After ≥2 failures, a mid-turn **escalation nudge** (**116**) should steer the model to `propose_file_edits` with complete `rawContent` (same-size rewrite), or an honest final answer without claiming disk writes.
- **Verify:** Turn trace: multiple `search_replace` `ok: false`, escalation marker in messages, then `propose_file_edits` `ok: true` **or** final answer + UI toast when the model claims “Updated …” without a proposal; destructive shrink still rejected (**115**).

---

## 11. Tool limits — max iterations / plan one discovery round

- **Setup (fast):** Model that keeps requesting `read_file` in a loop (or use dev mock).
- **Expected:** Stops at max tool iterations; final answer still streams.
- **Setup (plan):** One tool round then forced final plan (plan-mode tool cap).
- **Expected:** After discovery, final stream asks for `gf-plan` only.

---

## 12. Agent command approval — plan verify / install (126)

- **Setup:** Empty or greenfield workspace; produce a plan with `verification: npm run typecheck` (or install step), **Approve and run**.
- **Prompt:** Execute turn should request **`run_command`** (not only hand-written `package.json`).
- **Expected:** Inline **Approve agent command?** card with cwd root, purpose, policy tier; activity shows exit code after approval. Rejected commands must not produce “verified” final-answer claims.
- **Manual extras:** `git status` (diagnostic tier), `npm install` (network/install banner), soft-risk `rm -rf ./dist` requires checkbox before Approve.
- **Automated:** `behavior:run_command_plan_verify`, `policy:npm_install`, `policy:git_status_safe` in `npm run test:agent-eval`.

---

## 13. Greenfield scaffold — package.json / multi-file bootstrap (127)

- **Setup:** Empty workspace; produce a **Vite+React+TS** plan with `package.json`, `index.html`, `src/main.tsx` in `filesLikelyTouched`, **Approve and run**.
- **Expected:** Valid minified `package.json` passes validation (pretty-printed in diff); multi-file plan does **not** inject single-file **120** bias; invalid JSON rejection mentions `npm create` / `run_command`.
- **Scaffold commands:** Use full non-interactive Vite commands with `--template` (e.g. `npm create vite@latest . -- --template react-ts`); bare `npx create-vite@latest .` is rejected before approval with `suggestedCommand` in tool result.
- **Post-scaffold verify:** After successful `npm create` / `npx create-vite`, agent should `read_file` on `package.json`, vite config, and entry files — not only `list_directory`; harness injects verification nudge when reads are missing.
- **Partial recovery:** Invalid `package.json` + valid `index.html` in one batch → recovery nudge with **package.json** hint; final answer does not claim full scaffold complete.
- **Non-regression:** Populated repo + “add localStorage” in Work mode → **default** profile, no forced `gf-plan`.
- **Automated:** `behavior:greenfield_vite_scaffold`, `validation:package_json`, `recovery:scaffold_partial`, `routing:existing_project_no_replan` in `npm run test:agent-eval`.

---

## 14. Greenfield scaffold strategy — CLI vs file-first (128)

- **Setup:** Empty workspace; **Vite+React+TS** plan with `npm create` step → **Approve and run**.
- **Expected:** Harness includes scaffold strategy routing marker; model should sample **`run_command` only** first (no hand-written `package.json` in same round). Hybrid CLI + edits triggers **one** strategy nudge.
- **Static plan:** HTML/CSS/JS plan without package manager → **`propose_file_edits` only**; no `npm create` nudge.
- **Non-regression:** Populated repo + “add CSS” → no scaffold strategy nudge.
- **UI:** When command approval and file review are both pending during execute, footer mentions CLI awaiting approval.
- **Automated:** `behavior:scaffold_cli_only_first`, `behavior:scaffold_file_bootstrap_static`, `behavior:scaffold_hybrid_nudge`, `routing:existing_project_no_scaffold_nudge` in `npm run test:agent-eval`.

---

## 14. Non-greenfield Work edit (no replan)

- **Setup A (Vite/React):** Open a scaffolded Vite + React project (`package.json`, `src/App.tsx`). **Work** mode, default chip (no Plan).
- **Prompt A:** “Replace the home page with a simple task app (backlog, in progress, done).”
- **Expected A:** `turn_started` → **executor** + **execution** model; system includes **Work iterative edit (harness 130)** and **Populated workspace iterative edit (harness 129)** markers; activity rows titled **Work tool round** that turn **done** after each round (not a wall of “Planning … stopped”).
- **Setup B (small vanilla):** Open a multi-file vanilla site (`index.html`, `script.js`, …) **without** `package.json` (6+ non-trivial files, not greenfield). **Work** mode.
- **Prompt B:** “Add a dark mode toggle to the page.”
- **Expected B:** Same executor routing + harness **130** marker (no greenfield appendix).
- **Expected (both):** At most ~2 read-only rounds before `propose_file_edits` or `search_replace`; edit proposal appears in chat when the model cooperates.
- **Timeout:** Long turns may run up to ~10m budget; if timeout occurs **after** a proposal, chat still shows the diff review and an interrupted hint.
- **Automated:** `routing:existing_project_no_replan`, `routing:iterative_work_no_replan` in `npm run test:agent-eval`.

---

## Related

- Story **063** — eval harness foundation  
- Story **108** — per-profile matrix tests  
- Story **115** — edit cascade guard after `search_replace` failures
- Story **116** — search_replace failure escalation nudge + honest final-answer UX
- Story **129** — iterative Work stability on populated workspaces (executor routing, activity honesty, turn budget)
- Story **130** — Work iterative edit harness (non-greenfield routing, bounded discovery, slim prompts)
- [`AGENTS.md`](../AGENTS.md) — agent chat + harness eval policy  
- [`docs/i-am-a-harness.md`](i-am-a-harness.md) — harness design reference
