# Security

## Reporting a vulnerability

Please use **GitHub private vulnerability reporting** for this repository (Security tab → **Report a vulnerability**). That keeps details private while maintainers can triage and coordinate a fix.

Do **not** open a public issue for an undisclosed security problem.

If private reporting is unavailable for any reason, open a **draft** security-related issue with minimal detail and ask to move the conversation to a private channel.

## Scope notes

GrokForge is an **Electron desktop app** aimed at **trusted developers** on their own machines. It runs **workspace code**, **shell commands** (with explicit approval for agent-invoked commands), and **interactive terminals**. It is **not** a sandbox against malicious models or hostile users with local access. See [`AGENTS.md`](AGENTS.md) for process boundaries, API key handling, and terminal policy.
