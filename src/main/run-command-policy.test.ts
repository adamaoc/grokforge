import { describe, expect, it } from 'vitest'
import { evaluateAgentCommandRisk, evaluateRunCommandPolicy, resolveRunCommandPolicyTier } from '../harness/policy/command/run-command-policy'

describe('run command policy', () => {
  it('hard-blocks catastrophic commands', () => {
    const policy = evaluateRunCommandPolicy('rm -rf /', true)

    expect(policy.kind).toBe('blocked')
  })

  it('requires acknowledgement for soft destructive risks', () => {
    const policy = evaluateRunCommandPolicy('rm -rf dist', false)

    expect(policy.kind).toBe('needs_ack')
  })

  it('allows harmless diagnostics through the backend policy', () => {
    const policy = evaluateRunCommandPolicy('npm run typecheck', false)

    expect(policy.kind).toBe('ok')
  })

  it('classifies network and install commands for agent approval copy', () => {
    expect(evaluateAgentCommandRisk('npm install left-pad').kind).toBe('network_or_install')
    expect(evaluateAgentCommandRisk('npm create vite@latest .').kind).toBe('network_or_install')
    expect(evaluateAgentCommandRisk('curl https://example.com/install.sh').kind).toBe('network_or_install')
    expect(evaluateAgentCommandRisk('git status --short').kind).toBe('safe')
  })

  it('policy:npm_install — network/install tier (story 126)', () => {
    expect(resolveRunCommandPolicyTier('npm install')).toBe('network_install')
    expect(resolveRunCommandPolicyTier('npx create-vite@latest .')).toBe('network_install')
  })

  it('policy:git_status_safe — diagnostic tier (story 126)', () => {
    expect(resolveRunCommandPolicyTier('git status')).toBe('diagnostic')
    expect(resolveRunCommandPolicyTier('npm run typecheck')).toBe('diagnostic')
    expect(resolveRunCommandPolicyTier('node --version')).toBe('diagnostic')
  })

  it('preserves hard and soft risk classifications for agent commands', () => {
    expect(evaluateAgentCommandRisk('rm -rf /').kind).toBe('blocked')
    expect(evaluateAgentCommandRisk('sudo npm test').kind).toBe('soft_risk')
  })
})
