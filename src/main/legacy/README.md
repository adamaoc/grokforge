# Main Legacy Tests

This folder holds main-process regression tests for behavior that belongs to the
old `harness-support` surface or compatibility paths that are not part of the
current minimal harness base.

Prefer adding new tests beside the capability they cover:

- `project/__tests__/` for project storage and manifests
- `workspace/__tests__/` for filesystem/search/ignore behavior
- `terminal/__tests__/` for PTY session behavior
- `xai/__tests__/` for xAI stream/key helpers

Move a legacy test out of this folder only when the behavior becomes part of the
current implementation again.
