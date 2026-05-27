import { describe, expect, it } from 'vitest'
import {
  shouldRouteIterativeWorkExecutor,
  WORK_ITERATIVE_EDIT_MARKER,
} from './iterative-work-edit'
import type { GreenfieldIndexSnapshot } from './workspace-greenfield'

function indexWithFiles(
  fileCountScanned: number,
  files: GreenfieldIndexSnapshot['intelligence']['files'],
  packages: GreenfieldIndexSnapshot['intelligence']['packages'] = [],
): GreenfieldIndexSnapshot {
  return {
    intelligence: {
      files,
      packages,
      stats: { fileCountScanned },
    },
  }
}

describe('shouldRouteIterativeWorkExecutor', () => {
  it('routes Work edit intent on populated repo with package.json', () => {
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'fast',
        userText: 'add delete button to the task list',
        index: indexWithFiles(
          8,
          [{ relativePath: 'src/App.tsx', basename: 'App.tsx' }],
          [{ path: 'package.json', name: 'package.json' }],
        ),
      }),
    ).toBe(true)
  })

  it('routes Work edit on small non-greenfield repo without package.json', () => {
    const files = [
      { relativePath: 'index.html', basename: 'index.html' },
      { relativePath: 'styles.css', basename: 'styles.css' },
      { relativePath: 'script.js', basename: 'script.js' },
      { relativePath: 'app.js', basename: 'app.js' },
      { relativePath: 'utils.js', basename: 'utils.js' },
      { relativePath: 'config.js', basename: 'config.js' },
    ]
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'fast',
        userText: 'add a dark mode toggle',
        index: indexWithFiles(6, files),
      }),
    ).toBe(true)
  })

  it('does not route greenfield workspace', () => {
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'fast',
        userText: 'add a button',
        index: indexWithFiles(1, [{ relativePath: 'index.html', basename: 'index.html' }]),
      }),
    ).toBe(false)
  })

  it('does not route Plan mode', () => {
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'plan',
        userText: 'add delete button',
        index: indexWithFiles(
          8,
          [{ relativePath: 'src/App.tsx', basename: 'App.tsx' }],
          [{ path: 'package.json', name: 'package.json' }],
        ),
      }),
    ).toBe(false)
  })

  it('does not route replan requests', () => {
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'fast',
        userText: 'create a new plan for auth',
        index: indexWithFiles(
          8,
          [{ relativePath: 'src/App.tsx', basename: 'App.tsx' }],
          [{ path: 'package.json', name: 'package.json' }],
        ),
      }),
    ).toBe(false)
  })

  it('does not route bootstrap/scaffold user text on populated repo', () => {
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'fast',
        userText: 'scaffold a Vite React TypeScript app in this folder',
        index: indexWithFiles(
          8,
          [{ relativePath: 'src/App.tsx', basename: 'App.tsx' }],
          [{ path: 'package.json', name: 'package.json' }],
        ),
      }),
    ).toBe(false)
  })

  it('does not route npm create intent', () => {
    expect(
      shouldRouteIterativeWorkExecutor({
        chatMode: 'fast',
        userText: 'run npm create vite@latest . -- --template react-ts',
        index: indexWithFiles(
          8,
          [{ relativePath: 'src/App.tsx', basename: 'App.tsx' }],
          [{ path: 'package.json', name: 'package.json' }],
        ),
      }),
    ).toBe(false)
  })

  it('exports stable harness marker', () => {
    expect(WORK_ITERATIVE_EDIT_MARKER).toContain('130')
  })
})
