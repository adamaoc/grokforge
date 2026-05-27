import { describe, expect, it } from 'vitest'
import {
  assessPostScaffoldVerification,
  assessScaffoldCommand,
  buildNonEmptyScaffoldTargetWarning,
  buildNpmCreateViteCommand,
  buildNpxCreateViteCommand,
  detectScaffoldOutputFailure,
  inferViteTemplateFromText,
} from './agent-scaffold-command'

describe('inferViteTemplateFromText', () => {
  it('detects react-ts from plan copy', () => {
    expect(inferViteTemplateFromText('Vite React TypeScript todo app')).toBe('react-ts')
    expect(inferViteTemplateFromText('npm create vite --template react-ts')).toBe('react-ts')
  })
})

describe('assessScaffoldCommand', () => {
  it('rejects npx create-vite without template flag', () => {
    const r = assessScaffoldCommand({
      command: 'npx create-vite@latest .',
      expectedTemplate: 'react-ts',
    })
    expect(r.ok).toBe(false)
    expect(r.suggestedCommand).toContain('--template react-ts')
  })

  it('accepts canonical npm create vite command', () => {
    const cmd = buildNpmCreateViteCommand('.', 'react-ts')
    expect(assessScaffoldCommand({ command: cmd, expectedTemplate: 'react-ts' }).ok).toBe(true)
  })

  it('rejects npm create vite missing -- separator before template', () => {
    const r = assessScaffoldCommand({
      command: 'npm create vite@latest . --template react-ts',
      expectedTemplate: 'react-ts',
    })
    expect(r.ok).toBe(false)
    expect(r.suggestedCommand).toBe('npm create vite@latest . -- --template react-ts')
  })

  it('accepts npx with -y and template', () => {
    const cmd = buildNpxCreateViteCommand('.', 'react-ts')
    expect(assessScaffoldCommand({ command: cmd, expectedTemplate: 'react-ts' }).ok).toBe(true)
  })
})

describe('assessPostScaffoldVerification', () => {
  it('flags missing key reads after react-ts scaffold', () => {
    const r = assessPostScaffoldVerification({
      template: 'react-ts',
      readPaths: ['/proj/package.json'],
    })
    expect(r.complete).toBe(false)
    expect(r.missingPaths).toContain('src/main.tsx')
  })

  it('passes when core react-ts files were read', () => {
    const r = assessPostScaffoldVerification({
      template: 'react-ts',
      readPaths: [
        '/proj/package.json',
        '/proj/vite.config.ts',
        '/proj/src/main.tsx',
        '/proj/src/App.tsx',
      ],
    })
    expect(r.complete).toBe(true)
  })
})

describe('scaffold target warnings and output failure', () => {
  it('builds non-empty target warning with entry sample', () => {
    const msg = buildNonEmptyScaffoldTargetWarning({
      entryNames: ['.DS_Store', 'package.json'],
      targetLabel: '/tmp/proj',
    })
    expect(msg).toMatch(/not empty on disk/)
    expect(msg).toMatch(/\.DS_Store/)
  })

  it('detects create-vite Operation cancelled output', () => {
    expect(detectScaffoldOutputFailure('└  Operation cancelled')).toMatch(/Operation cancelled/)
    expect(detectScaffoldOutputFailure('done')).toBeNull()
  })
})
