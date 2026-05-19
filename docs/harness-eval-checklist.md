# Harness eval checklist (dual-model)

Manual smoke flows for GrokForge’s **harness** (prompts, profiles, tools, routing) — complement automated tests in `src/main/agent-runner-evaluation.test.ts`. Run after changing `agent-harness-profile.ts`, `agent-profile.ts`, `agent-turn-routing.ts`, or the agent tool loop.

**Automated gate:** `npm run test:agent-eval` (or full `npm run test`).

---

## 1. Fast chat — small edit with read-before-write

- **Setup:** Open a project with a small TS/JS file. **Fast** mode, default model (`grok-code-fast-1`).
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
- **Verify:** `turn_started` routing: `modelIntent: execution`, `agentProfileId: executor`, `grok-code-fast-1`. Optional: agent `read_file` on plan path returns structured JSON. Automated: `agent-runner-evaluation.test.ts` “injects compact approved plan artifact summary when approvedPlanId is set (109)”.

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

## 10. Tool limits — max iterations / plan one discovery round

- **Setup (fast):** Model that keeps requesting `read_file` in a loop (or use dev mock).
- **Expected:** Stops at max tool iterations; final answer still streams.
- **Setup (plan):** One tool round then forced final plan (plan-mode tool cap).
- **Expected:** After discovery, final stream asks for `gf-plan` only.

---

## Related

- Story **063** — eval harness foundation  
- Story **108** — per-profile matrix tests  
- [`AGENTS.md`](../AGENTS.md) — agent chat + harness eval policy  
- [`docs/i-am-a-harness.md`](i-am-a-harness.md) — harness design reference
