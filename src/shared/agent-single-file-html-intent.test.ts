import { describe, expect, it } from 'vitest'
import {
  htmlProposalContainsInlineScript,
  isHtmlCreationPath,
  userRequestsSingleFileHtml,
} from '../harness/policy/edit/single-file-html-intent'

describe('agent-single-file-html-intent', () => {
  it('detects inline script in HTML proposal', () => {
    expect(htmlProposalContainsInlineScript('<div></div><script>const x=1</script>')).toBe(true)
    expect(htmlProposalContainsInlineScript('<!DOCTYPE html><body><div id="app"></div></body>')).toBe(
      false,
    )
  })

  it('isHtmlCreationPath is true for new .html paths only', () => {
    expect(isHtmlCreationPath('/proj/index.html', false)).toBe(true)
    expect(isHtmlCreationPath('/proj/index.html', true)).toBe(false)
    expect(isHtmlCreationPath('/proj/script.js', false)).toBe(false)
  })

  it('detects explicit single html file in user text', () => {
    expect(
      userRequestsSingleFileHtml({
        userText: 'Keep this all as 1 single html file for the taskboard prototype',
      }),
    ).toBe(true)
    expect(
      userRequestsSingleFileHtml({
        userText: 'Build one single html file with columns',
      }),
    ).toBe(true)
  })

  it('detects TaskBoard HTML prototype shorthand', () => {
    expect(
      userRequestsSingleFileHtml({
        userText: 'TaskBoard HTML prototype',
      }),
    ).toBe(true)
  })

  it('detects single-path html plan without npm scaffold', () => {
    expect(
      userRequestsSingleFileHtml({
        plan: {
          filesLikelyTouched: ['index.html'],
          steps: [{ title: 'Create index.html' }],
        },
      }),
    ).toBe(true)
  })

  it('rejects multi-file html plan', () => {
    expect(
      userRequestsSingleFileHtml({
        plan: {
          filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
          steps: [{ title: 'Create files' }],
        },
      }),
    ).toBe(false)
  })

  it('rejects generic edit intent without html single-file signals', () => {
    expect(
      userRequestsSingleFileHtml({
        userText: 'fix the delete button in App.tsx',
      }),
    ).toBe(false)
  })
})
