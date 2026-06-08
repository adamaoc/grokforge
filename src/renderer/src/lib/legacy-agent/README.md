# Legacy Agent Renderer Adapters

These modules are renderer-facing compatibility facades over legacy
`src/harness-support` contracts that are still needed to display persisted chat
history, plan cards, proposal reviews, and failed-edit safety states.

Active renderer components should import from this folder instead of importing
`harness-support` directly. When a contract becomes durable product surface,
move it to `src/shared/<concept>/` and update these adapters or delete them.

