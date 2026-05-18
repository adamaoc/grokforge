# 036 — Terminal policy: align docs, behavior, and threat model

**Status:** Closed — resolved by stories **050–053**.

## Closure note

This story is closed without standalone implementation. Its original scope was to reconcile the old one-shot `run-command` behavior and documentation with the correct threat model: commands start in a selected workspace root, but GrokForge does not provide a shell jail.

That work has been folded into the real terminal redesign stories:

- **050 — Real terminal PTY foundation**
- **051 — Terminal emulator renderer with xterm.js**
- **052 — Terminal tabs, layout, and session UX**
- **053 — Terminal safety policy and agent boundaries**
- **054 — Terminal shell integration and polish**
- **055 — Retire command runner or reframe it as task runner**

Story **053** owns the safety-policy distinction between human-driven terminal sessions, one-shot guarded command execution, and model-requested command tools. Story **055** owns any further cleanup of the old command-runner internals.

## Original issue

The old terminal command runner was useful, but its docs carried a subtle tension. Story **017** described terminal execution as sandboxed and implied commands could not escape the selected root cwd. `AGENTS.md` correctly says this is **not** a shell jail because a user can run shell syntax such as `cd ..` or reference absolute paths.

The terminal redesign should keep the honest model:

- Human terminal sessions are trusted developer tooling.
- Terminal sessions start in the selected root, but are not jailed to it.
- Model/tool command execution must remain separate from the human PTY path.
- Guarded one-shot command execution, if retained, should keep policy checks, approval flow, output caps, and timeouts.

## Follow-up ownership

- Stale **017** language was corrected in **053** to remove sandbox claims.
- Keep `run-command-policy` tests meaningful for the guarded command/tool path.
- Ensure no user-facing copy claims root cwd is a security sandbox.
