# Field reports — agent harness comparisons

Dogfood notes from building the same **GrokForge Todo** greenfield app across hosts, using aligned prompts where possible.

| Report | Host | Focus |
|--------|------|--------|
| [codex-todoapp-comparison.md](./codex-todoapp-comparison.md) | OpenAI Codex (ChatGPT / Codex app, **Full access**) | Velocity harness, inline plan → Build it |
| [cursor-todoapp-comparison.md](./cursor-todoapp-comparison.md) | Cursor (Composer **Plan** → **Build** → **Agent**) | Clarifying questions, workspace `.plan.md` |
| [grokforge-todoapp-comparison.md](./grokforge-todoapp-comparison.md) | GrokForge (Grok **4.3** + **grok-build-0.1**) | Trust/velocity, `gf-plan`, diff review |
| [agent-harness-comparison.html](./agent-harness-comparison.html) | All three | Visual comparison + **happy path** for GrokForge |

**Source sessions:** Codex/Cursor analysis from [Harness comparison chat](ba93beca-ae15-43a0-a715-f2c52ef29e96); GrokForge iterations from [ToDoApp harness testing](b0f94885-94fa-4c41-a4b5-0072f4ac3a77) and story **118** field reports.

**Related backlog:** [118](../project_tasks/post-mvp/118-work-vs-plan-mode-and-conversation-lifecycle.md), [119](../project_tasks/post-mvp/119-agent-turn-ui-honesty-and-activity-compaction.md), [120](../project_tasks/post-mvp/120-post-plan-executor-routing-and-single-file-edits.md).
