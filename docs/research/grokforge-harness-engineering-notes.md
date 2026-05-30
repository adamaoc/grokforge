# Agent Harness Engineering – Key Points & GrokForge Applications

**Source:** [Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering/) by Addy Osmani

This document extracts the most relevant ideas from the article and maps them to GrokForge's current harness challenges (crushed code, brittle large edits, recovery loops, validation, long-running tasks, etc.).

---

## Core Principle

> **A decent model with a great harness outperforms a great model with a bad harness.**

The harness (prompts, tools, context policies, hooks, sandboxes, feedback loops, recovery paths) dominates agent behavior more than raw model intelligence. Most "model failures" are actually harness/skill issues.

**GrokForge Implication:**
We should treat recent failures (2000+ line bloated files, crushed JS, repeated `search_replace` rejections) as **harness problems**, not model problems. Every recurring mistake should trigger a permanent ratchet in the harness.

---

## Key Components of a Strong Harness

| Component              | Purpose                                      | GrokForge Current State          | Opportunity |
|------------------------|----------------------------------------------|----------------------------------|-----------|
| **System prompts / AGENTS.md / skill files** | Persistent rules & conventions              | Partial (some in profiles)      | Stronger, failure-traced AGENTS.md |
| **Tools + descriptions** | What the agent can actually do              | Good coverage, some brittleness | Improve edit tool quality |
| **Sandbox / Filesystem / Git** | Safe, durable state                         | Basic                           | Stronger isolation + Git integration |
| **Orchestration & routing** | Planner vs executor, model routing          | Exists (plan/work modes)        | Refine further |
| **Hooks & middleware** | Lint checks, compaction, safety gates       | Partial (some validation)       | **High priority** |
| **Observability**      | Traces, logs, cost, why decisions were made | Improving                       | More structured traces |
| **Recovery paths**     | What happens when something fails           | Exists but noisy                | Make more directed |

---

## Common Failure Modes & Anti-Patterns

**Frequent issues mentioned:**
- Agents making mistakes due to unknown conventions
- Running destructive commands
- Getting lost in long tasks / context rot
- Finishing with broken code
- Early stopping or poor decomposition
- Overly positive self-evaluation

**Anti-patterns to avoid:**
- Blaming the model instead of fixing the harness
- Waiting for a better model instead of adding constraints
- Overfitting the harness too tightly to one model (causes regressions when swapping models)

**GrokForge Relevance:**
- Our repeated crushed-code and large-file bloat issues are classic "harness not constraining bad output early enough."
- The "ratchet principle" (every mistake → permanent rule) is highly applicable.

---

## Best Practices & Recommendations

### 1. Work Backwards from Desired Behavior
Define what "good" looks like, then build the harness components that enforce it.

**For GrokForge:**
- Define clear success criteria for a proposal (clean formatting, passes basic checks, reasonable size delta).
- Then build validation that enforces those criteria.

### 2. Treat Mistakes as Permanent Signals ("The Ratchet")
Every time the agent produces bad output (crushed code, destructive change, etc.), add a rule, hook, or constraint so it never happens again.

**High-priority ratchets for GrokForge right now:**
- Stronger early detection of crushed/glued code
- Pre-validation before showing large `propose_file_edits`
- Clearer escalation rules between `search_replace` and full rewrites

### 3. Use Hooks for Safety and Verification
Hooks (lint, typecheck, format, destructive command blocking) should run automatically. Success should be silent; failures should be verbose and actionable.

**GrokForge Opportunity:**
Add lightweight hooks that run on proposed content before the user sees the diff (especially for JS/TS/TSX files).

### 4. Combat Context Rot
Long contexts degrade performance. Use compaction, tool offloading, progressive disclosure (skills), and fresh context resets for long tasks.

**GrokForge Relevance:**
Our long plan execution turns sometimes suffer from this. Better compaction or structured plan artifacts could help.

### 5. Evaluation & Self-Verification
Avoid letting the agent evaluate its own work. Use planner / generator / evaluator splits, or at minimum run real checks (lint, tests) after edits.

**Practical idea:**
After a proposal is applied (or even before), run a quick verification step and feed results back if issues are found.

### 6. Keep Memory Files Short and Earned
`AGENTS.md` / rule files should be short (<60 lines), earned from real failures, and focused on high-signal conventions.

### 7. Tool Design Principles
- Fewer, well-described tools are often better than many vague ones.
- Tool descriptions are trusted by the model — keep them accurate.
- Prefer focused tools over overly general ones when possible.

---

## Specific Opportunities for GrokForge

| Area                    | Article Insight                          | Current GrokForge State          | Recommended Action |
|-------------------------|------------------------------------------|----------------------------------|--------------------|
| **Edit Safety**        | Hooks to block destructive / low-quality changes | Partial validation exists       | Add pre-validation gate on `propose_file_edits` (Story 146) |
| **Code Quality**       | Ratchet every formatting/crushed failure | Still recurring                 | Stronger anti-crush rules + formatting enforcement |
| **Recovery**           | Make failures verbose and directed       | Recovery exists but noisy       | Improve feedback quality on rejection (Story 149) |
| **Incremental Work**   | Prefer smaller, verifiable steps         | Sometimes jumps to large rewrites | Better incremental editing strategy (Story 148) |
| **Long Tasks**         | Use planning artifacts + self-verification | Plan mode exists                | Strengthen plan artifacts + post-edit checks |
| **Observability**      | Traces and structured logs               | Improving                       | Continue enhancing turn traces and harness metrics |
| **Memory / Rules**     | Short, earned AGENTS.md                  | Scattered rules                 | Consolidate high-signal rules into a clean file |

---

## Prioritized Recommendations for GrokForge

1. **Implement the 4 stories** we created (pre-validation, anti-crush, incremental strategy, recovery) — they map very directly to the article's advice.
2. Adopt the **ratchet mindset** more aggressively: every time we see crushed code or bloated files, add a permanent constraint.
3. Add lightweight **hooks** that run on proposed content (formatting, basic structure checks) before diffs are shown.
4. Keep pushing toward **smaller, verifiable edits** by default, with clear escalation paths only when truly needed.
5. Consider creating a short, high-signal `AGENTS.md` (or equivalent) that captures the conventions we've learned from failures.

---

## Final Thought

The article reinforces something we've been seeing empirically:

> **Most of GrokForge’s current pain is harness engineering, not model capability.**

The models we're using (including `grok-build-0.1`) are capable of producing clean output when the surrounding system guides and constrains them well. Our job is to keep tightening the harness around the recurring failure modes until the bad behaviors become rare.

This document can serve as a living reference as we continue improving the harness.