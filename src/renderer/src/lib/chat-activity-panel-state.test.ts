import { describe, expect, it } from 'vitest'
import {
  shouldAutoExpandActivityPanel,
  shouldCollapseOnTurnEnd,
} from './chat-activity-panel-state'

describe('shouldAutoExpandActivityPanel', () => {
  it('stays collapsed by default during live turns', () => {
    expect(
      shouldAutoExpandActivityPanel({
        isLive: true,
        hasNewError: false,
        forceExpanded: false,
        alwaysExpandPref: false,
      }),
    ).toBe(false)
  })

  it('does not expand for many steps alone', () => {
    expect(
      shouldAutoExpandActivityPanel({
        isLive: true,
        hasNewError: false,
        forceExpanded: false,
        alwaysExpandPref: false,
      }),
    ).toBe(false)
  })

  it('expands on new live error', () => {
    expect(
      shouldAutoExpandActivityPanel({
        isLive: true,
        hasNewError: true,
        forceExpanded: false,
        alwaysExpandPref: false,
      }),
    ).toBe(true)
  })

  it('respects forceExpanded', () => {
    expect(
      shouldAutoExpandActivityPanel({
        isLive: false,
        hasNewError: false,
        forceExpanded: true,
        alwaysExpandPref: false,
      }),
    ).toBe(true)
  })

  it('respects alwaysExpandPref', () => {
    expect(
      shouldAutoExpandActivityPanel({
        isLive: true,
        hasNewError: false,
        forceExpanded: false,
        alwaysExpandPref: true,
      }),
    ).toBe(true)
  })
})

describe('shouldCollapseOnTurnEnd', () => {
  it('does not collapse while live', () => {
    expect(
      shouldCollapseOnTurnEnd({
        isLive: true,
        userPinnedExpand: true,
      }),
    ).toBe(false)
  })

  it('collapses when turn ends without pin', () => {
    expect(
      shouldCollapseOnTurnEnd({
        isLive: false,
        userPinnedExpand: false,
      }),
    ).toBe(true)
  })

  it('keeps expanded when user pinned during live turn', () => {
    expect(
      shouldCollapseOnTurnEnd({
        isLive: false,
        userPinnedExpand: true,
      }),
    ).toBe(false)
  })
})
