import { describe, expect, it } from 'vitest'
import type { AgentChatActivityPayload } from '../../../shared/agent-chat-contract'
import {
  FAILED_EDIT_FENCE_REMOVED_PLACEHOLDER,
  fenceExceedsFailedEditReferenceCap,
  resolveFailedEditFinalAnswerDisplayContext,
  sanitizeFailedEditFinalAnswerDisplay,
  shouldSanitizeFailedEditFinalAnswerDisplay,
} from './assistant-final-answer-sanitize'

const failedActivities: AgentChatActivityPayload[] = [
  { id: 'e1', title: 'Edit proposal failed', status: 'error' },
]

describe('fenceExceedsFailedEditReferenceCap', () => {
  it('is false for fences within story 152 caps', () => {
    const small = '```html\n' + '<div>line</div>\n'.repeat(10) + '```'
    expect(fenceExceedsFailedEditReferenceCap(small)).toBe(false)
  })

  it('is true when line count exceeds 30', () => {
    const big = '```html\n' + '<div>line</div>\n'.repeat(50) + '```'
    expect(fenceExceedsFailedEditReferenceCap(big)).toBe(true)
  })
})

describe('resolveFailedEditFinalAnswerDisplayContext', () => {
  it('marks failures without accepted proposal', () => {
    expect(
      resolveFailedEditFinalAnswerDisplayContext(failedActivities, {
        chatMode: 'fast',
      }),
    ).toEqual({
      hadEditFailures: true,
      editProposalCreated: false,
      chatMode: 'fast',
    })
  })

  it('marks editProposalCreated when prepared proposal succeeded', () => {
    const ctx = resolveFailedEditFinalAnswerDisplayContext([
      ...failedActivities,
      { id: 'ok', title: 'Prepared edit proposal', status: 'done' },
    ])
    expect(ctx.editProposalCreated).toBe(true)
  })
})

describe('shouldSanitizeFailedEditFinalAnswerDisplay', () => {
  it('is false in plan mode', () => {
    expect(
      shouldSanitizeFailedEditFinalAnswerDisplay({
        hadEditFailures: true,
        editProposalCreated: false,
        chatMode: 'plan',
      }),
    ).toBe(false)
  })

  it('is true when failures occurred with no proposal', () => {
    expect(
      shouldSanitizeFailedEditFinalAnswerDisplay({
        hadEditFailures: true,
        editProposalCreated: false,
        chatMode: 'fast',
      }),
    ).toBe(true)
  })
})

describe('sanitizeFailedEditFinalAnswerDisplay', () => {
  it('leaves text unchanged on happy path', () => {
    const text = 'Here is a short explanation without edits.'
    const ctx = resolveFailedEditFinalAnswerDisplayContext([])
    expect(sanitizeFailedEditFinalAnswerDisplay(text, ctx)).toBe(text)
  })

  it('leaves large fence when a proposal was accepted', () => {
    const bigFence = '```html\n' + '<div>x</div>\n'.repeat(50) + '```'
    const text = `Done.\n\n${bigFence}`
    const ctx = resolveFailedEditFinalAnswerDisplayContext([
      { id: 'ok', title: 'Prepared edit proposal', status: 'done' },
    ])
    expect(sanitizeFailedEditFinalAnswerDisplay(text, ctx)).toBe(text)
  })

  it('replaces oversized fence on TaskBoard-style failed-create turn (156)', () => {
    const bigFence = '```html\n' + '<div>line</div>\n'.repeat(50) + '```'
    const text = `Here is your complete single-file HTML prototype.\n\n${bigFence}`
    const ctx = resolveFailedEditFinalAnswerDisplayContext(failedActivities, {
      chatMode: 'fast',
    })
    const out = sanitizeFailedEditFinalAnswerDisplay(text, ctx)
    expect(out).toContain('Here is your complete single-file HTML prototype.')
    expect(out).toContain(FAILED_EDIT_FENCE_REMOVED_PLACEHOLDER)
    expect(out).not.toContain('<div>line</div>')
  })

  it('preserves small fenced snippet under caps when edits failed', () => {
    const smallFence = '```html\n<!DOCTYPE html>\n<html></html>\n```'
    const text = `Unapplied reference:\n\n${smallFence}`
    const ctx = resolveFailedEditFinalAnswerDisplayContext(failedActivities, {
      chatMode: 'fast',
    })
    expect(sanitizeFailedEditFinalAnswerDisplay(text, ctx)).toBe(text)
  })

  it('does not sanitize in plan mode even with failures', () => {
    const bigFence = '```html\n' + 'x\n'.repeat(50) + '```'
    const text = `Plan follow-up.\n\n${bigFence}`
    const ctx = resolveFailedEditFinalAnswerDisplayContext(failedActivities, {
      chatMode: 'plan',
    })
    expect(sanitizeFailedEditFinalAnswerDisplay(text, ctx)).toBe(text)
  })
})
