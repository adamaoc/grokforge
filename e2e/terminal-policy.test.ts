import { describe, expect, it } from 'vitest'
import { evaluateRunCommandPolicy } from '../src/main/run-command-policy'

describe('run-command policy (019)', () => {
  it('hard-blocks rm -rf at filesystem root', () => {
    const r = evaluateRunCommandPolicy('rm -rf /', false)
    expect(r.kind).toBe('blocked')
  })

  it('allows benign commands without acknowledgement', () => {
    expect(evaluateRunCommandPolicy('ls -la', false).kind).toBe('ok')
  })

  it('requires acknowledgement for sudo', () => {
    const r = evaluateRunCommandPolicy('sudo ls', false)
    expect(r.kind).toBe('needs_ack')
    expect(evaluateRunCommandPolicy('sudo ls', true).kind).toBe('ok')
  })

  it('requires acknowledgement for rm -rf (non-root)', () => {
    expect(evaluateRunCommandPolicy('rm -rf ./out', false).kind).toBe('needs_ack')
    expect(evaluateRunCommandPolicy('rm -rf ./out', true).kind).toBe('ok')
  })

  it('policy:npm_install — install commands require approval path but pass backend policy', () => {
    expect(evaluateRunCommandPolicy('npm install', false).kind).toBe('ok')
  })

  it('policy:git_status_safe — diagnostic commands pass backend policy', () => {
    expect(evaluateRunCommandPolicy('git status', false).kind).toBe('ok')
    expect(evaluateRunCommandPolicy('npm run typecheck', false).kind).toBe('ok')
  })
})
