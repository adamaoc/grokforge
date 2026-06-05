import { describe, expect, it } from 'vitest'
import { commandLikelyMutatesWorkspace, impliesCommandExecution, isBootstrapScaffoldUserText } from '../harness-support/routing/command-intent'

describe('impliesCommandExecution', () => {
  it('detects install and verify commands', () => {
    expect(impliesCommandExecution('run npm install')).toBe(true)
    expect(impliesCommandExecution('npm run typecheck')).toBe(true)
    expect(impliesCommandExecution('git init')).toBe(true)
  })

  it('ignores normal edit intents', () => {
    expect(impliesCommandExecution('add a delete button to the todo list')).toBe(false)
    expect(impliesCommandExecution('fix the CSS padding')).toBe(false)
  })
})

describe('commandLikelyMutatesWorkspace', () => {
  it('flags scaffold/install commands', () => {
    expect(commandLikelyMutatesWorkspace('npm install')).toBe(true)
    expect(commandLikelyMutatesWorkspace('npm create vite@latest . -- --template react-ts')).toBe(true)
    expect(commandLikelyMutatesWorkspace('git init')).toBe(true)
  })

  it('skips read-only diagnostics', () => {
    expect(commandLikelyMutatesWorkspace('git status')).toBe(false)
    expect(commandLikelyMutatesWorkspace('npm run typecheck')).toBe(false)
  })
})

describe('isBootstrapScaffoldUserText', () => {
  it('matches scaffold/bootstrap phrasing without npm literal', () => {
    expect(isBootstrapScaffoldUserText('scaffold a Vite React app in this empty folder')).toBe(true)
    expect(isBootstrapScaffoldUserText('create a full todo app from scratch')).toBe(true)
  })

  it('does not match incremental feature edits', () => {
    expect(isBootstrapScaffoldUserText('add delete button to the task list')).toBe(false)
    expect(isBootstrapScaffoldUserText('fix the CSS padding on the header')).toBe(false)
  })
})
