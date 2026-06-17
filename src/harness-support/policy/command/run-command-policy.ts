/**
 * v1 command policy: hard-deny catastrophic patterns; softer risks require renderer acknowledgement.
 * See AGENTS.md — "Terminal / shell execution".
 */

export type PolicyOutcome =
  | { kind: 'ok' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'needs_ack'; reason: string }

export type AgentCommandRisk =
  | { kind: 'blocked'; reason: string }
  | { kind: 'soft_risk'; reason: string }
  | { kind: 'network_or_install'; reason: string }
  | { kind: 'safe'; reason: string }

export type RunCommandPolicyTier =
  | 'hard_deny'
  | 'soft_risk'
  | 'network_install'
  | 'diagnostic'
  | 'safe'

/** Read-only / low-risk commands that may run without a user approval card. */
export function isDiagnosticAutoApproveCommand(command: string): boolean {
  const policy = evaluateRunCommandPolicy(command, false)
  if (policy.kind !== 'ok') return false
  if (evaluateAgentCommandRisk(command).kind === 'network_or_install') return false

  const c = command.trim().toLowerCase()
  if (
    /\bgit\s+(status|log|diff|branch|rev-parse)\b/i.test(c) ||
    /\b(node|npm|pnpm|yarn|bun)\s+(-v|--version)\b/i.test(c) ||
    /\b(npm|pnpm|yarn|bun)\s+run\s+(typecheck|lint|check|test|build)\b/i.test(c)
  ) {
    return true
  }

  // Simple inspection — cat/head/tail/ls/pwd/wc (no curl/wget/npm/npx in the same command)
  if (/\b(curl|wget|npm|npx|pnpm|yarn|bun|pip|sudo)\b/i.test(c)) return false
  if (
    /^\s*(cat|head|tail|wc|ls|pwd|file|stat|du|echo|test|true|false)\b/i.test(c) ||
    /^\s*find\s+\S+\s+-maxdepth\s+\d+/i.test(c)
  ) {
    return true
  }

  return false
}

export function resolveRunCommandPolicyTier(command: string): RunCommandPolicyTier {
  const policy = evaluateRunCommandPolicy(command, false)
  if (policy.kind === 'blocked') return 'hard_deny'
  if (policy.kind === 'needs_ack') return 'soft_risk'
  const risk = evaluateAgentCommandRisk(command)
  if (risk.kind === 'network_or_install') return 'network_install'
  if (isDiagnosticAutoApproveCommand(command)) return 'diagnostic'
  return 'safe'
}

export function evaluateAgentCommandRisk(command: string): AgentCommandRisk {
  const policy = evaluateRunCommandPolicy(command, false)
  if (policy.kind === 'blocked') return { kind: 'blocked', reason: policy.reason }
  if (policy.kind === 'needs_ack') return { kind: 'soft_risk', reason: policy.reason }
  const c = command.trim().toLowerCase()
  if (
    /\b(curl|wget)\b/i.test(c) ||
    /\bgit\s+clone\b/i.test(c) ||
    /\bnpx\s+/i.test(c) ||
    /\b(npm|pnpm|yarn|bun)\s+(install|add|remove|update|upgrade|dlx|create|exec)\b/i.test(c) ||
    /\b(pip|pip3|python\s+-m\s+pip)\s+install\b/i.test(c) ||
    /\b(brew|apt|apt-get|dnf|yum|cargo|gem|go)\s+(install|add|get)\b/i.test(c)
  ) {
    return {
      kind: 'network_or_install',
      reason: 'This command may access the network, install packages, or run fetched code. Review it before approving.',
    }
  }
  return { kind: 'safe', reason: 'No high-risk pattern matched, but model-requested commands still require approval.' }
}

export function evaluateRunCommandPolicy(command: string, acknowledgedDestructive: boolean): PolicyOutcome {
  const c = command.trim()
  if (!c.length) {
    return { kind: 'blocked', reason: 'Command is empty.' }
  }

  const lower = c.toLowerCase()

  // Hard deny — never run, even with acknowledgement
  // Only block when the deletion target is filesystem root `/`, not e.g. `/home`.
  if (/\brm\s+(-[^\s]*r[^\s]*f[^\s]*|-[^\s]*f[^\s]*r[^\s]*|-rf|-fr)\s+\/\s*([;&|]|$)/i.test(lower)) {
    return { kind: 'blocked', reason: 'Refusing: rm -rf (or similar) targeting / is not allowed.' }
  }
  if (/\brm\s+[^\n]*--no-preserve-root\b/i.test(lower) && /\s\/(\s|$|[;&|])/.test(lower)) {
    return { kind: 'blocked', reason: 'Refusing: rm with --no-preserve-root at /.' }
  }
  if (/\bdd\b/i.test(lower) && /\bof=\/dev\//i.test(lower)) {
    return { kind: 'blocked', reason: 'Refusing: dd with output to /dev/ is not allowed.' }
  }
  if (/\bmks?fs\b/i.test(lower)) {
    return { kind: 'blocked', reason: 'Refusing: disk formatting commands are disabled.' }
  }
  if (/>\s*\/dev\/(sd|hd|nvme|disk|mmcblk)/i.test(c)) {
    return { kind: 'blocked', reason: 'Refusing: redirect to raw block devices is not allowed.' }
  }
  if (/:\(\)\s*\{\s*:\|:&\s*\};:/.test(c)) {
    return { kind: 'blocked', reason: 'Refusing: fork-bomb pattern.' }
  }

  if (!acknowledgedDestructive) {
    if (/\bsudo\b/i.test(c)) {
      return {
        kind: 'needs_ack',
        reason: 'This command uses sudo. Only continue if you fully trust it.',
      }
    }
    if (/\brm\s+(-[^\s]*r[^\s]*f[^\s]*|-[^\s]*f[^\s]*r[^\s]*|-rf|-fr)\b/i.test(lower)) {
      return {
        kind: 'needs_ack',
        reason: 'This command includes rm -rf. It can delete files under the selected workspace root cwd.',
      }
    }
    if (/\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/i.test(lower)) {
      return {
        kind: 'needs_ack',
        reason: 'This command pipes downloaded content into a shell. Only continue if you trust the source.',
      }
    }
  }

  return { kind: 'ok' }
}
