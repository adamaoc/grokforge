# 008 - File Size And Effect Audit

## Goal

Create a lightweight recurring audit for oversized files, excessive effects, and
legacy import leaks so cleanup progress stays visible.

## Why

The cleanup work is easier to sustain when the project has simple signals:
largest files, effect-heavy components, and renderer imports from legacy areas.
This does not need a strict lint rule yet; a documented manual audit is enough.

## Scope

Add a script or documented command set that reports:

- largest files in `src/`
- React components with the most `useEffect` / `useLayoutEffect` calls
- renderer imports from `harness-support`
- stale active-doc references to removed flat paths

Possible script:

- `scripts/cleanup-audit.mjs`
- optional npm script: `npm run cleanup:audit`

## Guardrails

- Do not fail CI yet unless the team decides thresholds are mature.
- Keep output readable and actionable.
- Avoid complex custom parsing if `rg`, `wc`, and simple Node code are enough.

## Acceptance Criteria

- A contributor can run one command or copy one documented command block to see
  cleanup hotspots.
- The audit identifies at least:
  - top 30 largest source files
  - top effect-heavy React files
  - active renderer imports from `harness-support`
- README or cleanup README points to the audit.
- `npm run typecheck` passes if a script is added.

## Nice To Have

- Track baseline counts in `project_tasks/project_cleanup/README.md` after each
  major cleanup pass.
