# 039 — Context budget and retrieval governance

**Status:** Done — context layers and budgets are centralized in `src/shared/agent-context-budget-contract.ts`, active/retrieved/tool budgets are applied by the agent runner/tool loop, automatic retrieval keeps ignored and sensitive files out, and the agent context preview now reports budget sizes, workspace index details, and the last retrieval debug snapshot.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing context preview, agent activity, search result, or settings UI.

## Why this story exists

The lightweight workspace index added to the chat system prompt is useful because it gives the model a map. But there is a trap: as the app gets smarter, it will be tempting to keep stuffing more project data into every prompt. That becomes expensive, slow, stale, and still less accurate than letting the agent retrieve exactly what it needs.

This story exists to keep context intentional. The system prompt should carry durable rules and a compact map. Specific files, excerpts, symbols, and command outputs should come from retrieval and tools.

## Summary

Define budgets, ranking rules, freshness rules, and debugging UI for prompt context and retrieval. Make sure GrokForge’s “full context” promise means “the agent can access the right context” rather than “every file is pasted into every request.”

## Relationship to other stories

- Builds on the bounded workspace index in `agent-context.ts`.
- Complements **034 — Agent tool loop and workspace intelligence**.
- Should inform any future embedding/indexing story.

## Goals

- Keep system prompts bounded and predictable.
- Separate durable context, active context, retrieved context, and tool results.
- Make retrieval decisions explainable during debugging.
- Avoid leaking secrets through automatic context.
- Avoid stale indexes silently misleading the model.

## Context layers

Define these layers explicitly:

1. **Durable system rules**
   - product rules
   - workspace roots
   - write protocol
   - safety constraints

2. **Workspace map**
   - bounded root summaries
   - package hints
   - important files
   - shallow tree sketch

3. **Active UI context**
   - active root
   - active file
   - open tabs
   - selected text
   - pending writes

4. **Retrieved context**
   - files/excerpts selected for this user turn
   - search results
   - symbol/path matches

5. **Tool results**
   - read/search/list/terminal outputs produced during the turn

Only layers 1 and 2 should be present on nearly every turn. Layers 3-5 should be dynamic and capped.

## Budget policy

Define explicit budgets:

- system prompt max chars
- workspace index max chars
- active context max chars
- retrieved context max chars
- tool result max chars
- per-file excerpt max chars
- max files/excerpts per turn

Budgets should be constants with tests, not magic numbers scattered across components.

## Retrieval ranking

Start lexical and transparent:

- exact mentioned path wins
- open/active file boost
- filename match
- symbol-ish term match
- package/config files boost for setup questions
- docs boost for product/architecture questions
- tests boost for bug/regression questions
- recently edited/opened boost
- ignored paths excluded
- secret-like files excluded unless explicitly opened by user and safe to include

## Freshness

Index state should eventually track:

- createdAt
- updatedAt
- root paths
- ignore patterns used
- file count scanned
- truncation status
- error status

If the index is stale:

- retrieval may still use it with a warning
- UI can show stale status
- agent prompt should avoid claiming complete certainty from stale index alone

## Secret and sensitive file handling

Automatic context should avoid:

- `.env`
- `.env.*`
- private keys
- certificate/key files
- files with obvious token/API key names
- large binary/generated files
- ignored paths

If the user explicitly opens or asks about a sensitive file, require deliberate handling and avoid echoing secrets in chat.

## Debugging UI

Add or extend context preview so developers can see:

- system prompt size
- index size
- active context included
- retrieved files/excerpts
- skipped files and reasons
- stale/truncated warnings

This is primarily a developer/debug surface, not a giant end-user modal.

## Testing

Unit tests:

- budgets are enforced
- ignored files do not enter context
- sensitive files are excluded from automatic context
- active file ranks higher than unrelated matches
- exact path mentions rank highest
- stale index status is represented

Integration tests:

- prompt asking about a known component retrieves that component
- prompt asking about setup retrieves package/config docs
- prompt asking about docs retrieves markdown/docs files
- prompt with no specific target does not dump large arbitrary context

## Acceptance criteria

- [x] Context layer model is documented in code or docs.
- [x] Prompt/retrieval budgets are centralized and tested.
- [x] Automatic context excludes ignored and secret-like files.
- [x] Context preview/debug surface shows what was included and why.
- [x] Workspace index remains a compact map, not an ever-growing prompt dump.
- [x] Story 034 uses these rules when implementing the tool loop.
