/**
 * Context governance constants shared by the main agent runner and debug preview.
 *
 * Context layers (conceptual; not every layer is a separate API payload):
 * 1. durable system rules: GrokForge product rules, roots, manifest custom instructions,
 *    optional instructions file, always-include files, write/review protocol
 * 2. workspace map: ignore-aware index (manifest + shallow .gitignore/.cursorignore), tree sketch, package hints
 * 3. active UI context: active root/file, open tabs, attachments, selection, chat mode for the turn
 * 4. retrieved context: capped excerpts chosen for the current user message
 * 5. tool results: read/search/list/command outputs during the tool loop (aggregate + per-read caps)
 *
 * Chat **thread history** (prior turns) is governed by the model context window, not a row here.
 */

export const AGENT_CONTEXT_BUDGETS = {
  systemPromptMaxChars: 28_000,
  workspaceIndexMaxDepth: 4,
  workspaceIndexMaxEntriesPerRoot: 220,
  workspaceIndexMaxImportantFilesPerRoot: 40,
  activeContextMaxChars: 8_000,
  threadMemoryMaxChars: 2_000,
  retrievedContextMaxChars: 18_000,
  retrievalMaxFilesPerTurn: 5,
  retrievalPerFileMaxChars: 40_000,
  readFileDefaultLines: 240,
  readFileMaxLines: 800,
  toolTotalResultMaxChars: 80_000,
  toolReadFileMaxChars: 40_000,
} as const

export type AgentContextLayerId =
  | 'durable_system_rules'
  | 'workspace_map'
  | 'active_ui_context'
  | 'retrieved_context'
  | 'tool_results'

export type AgentContextLayerPolicy = {
  id: AgentContextLayerId
  name: string
  includedByDefault: boolean
  budgetKey?: keyof typeof AGENT_CONTEXT_BUDGETS
  description: string
}

export const AGENT_CONTEXT_LAYER_POLICIES: AgentContextLayerPolicy[] = [
  {
    id: 'durable_system_rules',
    name: 'Durable system rules',
    includedByDefault: true,
    budgetKey: 'systemPromptMaxChars',
    description:
      'GrokForge product rules, workspace roots, manifest custom instructions (and optional instructions file), always-include files, and file write / diff review protocol.',
  },
  {
    id: 'workspace_map',
    name: 'Workspace map',
    includedByDefault: true,
    budgetKey: 'workspaceIndexMaxEntriesPerRoot',
    description:
      'Bounded, ignore-aware index per root (manifest globs plus root / one-level .gitignore and .cursorignore), shallow tree sketch, package hints, and important files.',
  },
  {
    id: 'active_ui_context',
    name: 'Active UI context',
    includedByDefault: false,
    budgetKey: 'activeContextMaxChars',
    description:
      'Active root and file, open editor tabs, attachments, selected editor text, and chat-relevant UI mode for this turn.',
  },
  {
    id: 'retrieved_context',
    name: 'Retrieved context',
    includedByDefault: false,
    budgetKey: 'retrievedContextMaxChars',
    description:
      'Turn-specific file excerpts for this user message: ranked from workspace intelligence (lexical/symbol matches, open tabs, active file, attachments), then read with per-file caps.',
  },
  {
    id: 'tool_results',
    name: 'Tool results',
    includedByDefault: false,
    budgetKey: 'toolTotalResultMaxChars',
    description:
      'Capped output from workspace tools during the loop (read/search/list/run_command, etc.), including aggregate and per-read limits.',
  },
]
