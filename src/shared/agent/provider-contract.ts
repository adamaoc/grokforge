/**
 * Coding-agent provider contract (no Node imports).
 *
 * GrokForge drives an external coding agent the user already has installed and signed in
 * to (their own subscription). Agents speak the Agent Client Protocol (ACP) over stdio;
 * main-process implementation lives in `src/main/acp/`.
 */

export const AGENT_PROVIDER_IDS = ['grok-build', 'claude-code'] as const

export type AgentProviderId = (typeof AGENT_PROVIDER_IDS)[number]

export type AgentProviderStatus = {
  id: AgentProviderId
  label: string
  /** One-line description of how it is billed / signed in. */
  tagline: string
  /** True when GrokForge found what it needs to start this provider. */
  available: boolean
  /** Detected binary path / version. */
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
}
