/**
 * Coding-agent provider contract (no Node imports).
 *
 * GrokForge can drive an external coding agent the user already has installed and
 * signed in (their own subscription), or fall back to the built-in Grok API harness.
 * External agents speak the Agent Client Protocol (ACP) over stdio; main-process
 * implementation lives in `src/main/acp/`.
 */

export const AGENT_PROVIDER_IDS = ['grok-build', 'claude-code', 'grok-api'] as const

export type AgentProviderId = (typeof AGENT_PROVIDER_IDS)[number]

/** `acp`: external CLI over Agent Client Protocol. `builtin`: in-process xAI API harness. */
export type AgentProviderKind = 'acp' | 'builtin'

export type AgentProviderStatus = {
  id: AgentProviderId
  label: string
  kind: AgentProviderKind
  /** One-line description of how it is billed / signed in. */
  tagline: string
  /** True when GrokForge found what it needs to start this provider. */
  available: boolean
  /** Detected binary path / version, or key source. */
  detail?: string
  /** Install or sign-in hint when unavailable (or when sign-in may still be needed). */
  hint?: string
}

export type AgentProvidersResult = {
  selected: AgentProviderId
  providers: AgentProviderStatus[]
}

export type SetAgentProviderResult =
  | { ok: true; selected: AgentProviderId }
  | { ok: false; error: string }

export function isAgentProviderId(value: unknown): value is AgentProviderId {
  return typeof value === 'string' && (AGENT_PROVIDER_IDS as readonly string[]).includes(value)
}

export const AGENT_PROVIDER_LABELS: Record<AgentProviderId, string> = {
  'grok-build': 'Grok Build',
  'claude-code': 'Claude Code',
  'grok-api': 'Grok API',
}
