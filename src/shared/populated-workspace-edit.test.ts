import { describe, expect, it } from 'vitest'
import {
  isPopulatedWorkspace,
  POPULATED_WORK_EDIT_MARKER,
  shouldRoutePopulatedWorkExecutor,
} from './populated-workspace-edit'
import type { GreenfieldIndexSnapshot } from './workspace-greenfield'

function indexWithFiles(fileCountScanned: number, packages: GreenfieldIndexSnapshot['intelligence']['packages'] = []): GreenfieldIndexSnapshot {
  return {
    intelligence: {
      files: [{ relativePath: 'src/App.tsx', basename: 'App.tsx' }],
      packages,
      stats: { fileCountScanned },
    },
  }
}

describe('isPopulatedWorkspace', () => {
  it('returns false when index is null', () => {
    expect(isPopulatedWorkspace(null)).toBe(false)
  })

  it('returns true when package.json is present', () => {
    expect(
      isPopulatedWorkspace(
        indexWithFiles(3, [{ path: 'package.json', name: 'package.json' }]),
      ),
    ).toBe(true)
  })

  it('returns true when file count exceeds greenfield cap', () => {
    expect(isPopulatedWorkspace(indexWithFiles(20))).toBe(true)
  })
})

describe('shouldRoutePopulatedWorkExecutor', () => {
  it('routes Work edit intent on populated repo', () => {
    expect(
      shouldRoutePopulatedWorkExecutor({
        chatMode: 'fast',
        userText: 'add delete button to the task list',
        index: indexWithFiles(8, [{ path: 'package.json', name: 'package.json' }]),
      }),
    ).toBe(true)
  })

  it('does not route Plan mode', () => {
    expect(
      shouldRoutePopulatedWorkExecutor({
        chatMode: 'plan',
        userText: 'add delete button',
        index: indexWithFiles(8, [{ path: 'package.json', name: 'package.json' }]),
      }),
    ).toBe(false)
  })

  it('does not route replan requests', () => {
    expect(
      shouldRoutePopulatedWorkExecutor({
        chatMode: 'fast',
        userText: 'create a new plan for auth',
        index: indexWithFiles(8, [{ path: 'package.json', name: 'package.json' }]),
      }),
    ).toBe(false)
  })

  it('exports stable harness marker', () => {
    expect(POPULATED_WORK_EDIT_MARKER).toContain('129')
  })
})
