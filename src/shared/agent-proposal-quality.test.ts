import { describe, expect, it } from 'vitest'
import {
  diagnoseMarkdownProposalRepair,
  formatMarkdownProposalDiagnostics,
  isSearchReplaceResultDestructive,
  isTitleOnlyMarkdownStub,
  isUnacceptableCrushedMarkdownProposal,
  resolveCrushedMarkdownRejectionReason,
  TITLE_ONLY_MARKDOWN_STUB_REASON,
  tryRepairMarkdownProposalFromDisk,
} from './agent-proposal-quality'

describe('isUnacceptableCrushedMarkdownProposal', () => {
  const original = `# TaskBoard Overview

## Key Features
- Create tasks

## Tech Stack (planned)
- Frontend: Likely React
- Backend: TBD
`

  it('rejects stub that omits an original section heading', () => {
    const stub = '# TaskBoard Overview ## Tech Stack (planned) - Frontend: React + TypeScript'
    expect(
      isUnacceptableCrushedMarkdownProposal(original, stub, '/proj/docs/overview.md'),
    ).toBe(true)
  })

  it('allows full-file proposal with section edit', () => {
    const updated = original.replace('Likely React', 'React + TypeScript')
    expect(
      isUnacceptableCrushedMarkdownProposal(original, updated, '/proj/docs/overview.md'),
    ).toBe(false)
  })

  it('allows proposal that renames Tech Stack (planned) to Tech Stack', () => {
    const updated = original
      .replace('## Tech Stack (planned)', '## Tech Stack')
      .replace('Likely React', 'React + TypeScript')
      .replace('To be determined', 'Node.js + TypeScript\n- Build & Serve: Vite')
    expect(
      isUnacceptableCrushedMarkdownProposal(original, updated, '/proj/docs/overview.md'),
    ).toBe(false)
  })

  it('does not treat valid search_replace patch as destructive when file grows', () => {
    const disk = `# TaskBoard Overview  

## Key Features 

- one

## Tech Stack (planned) 

- Frontend: Likely React 
- Backend: TBD  
`
    const patched = disk
      .replace('## Tech Stack (planned)', '## Tech Stack')
      .replace('- Frontend: Likely React', '- Frontend: React + TypeScript')
      .replace('- Backend: TBD', '- Backend: Node.js + TypeScript\n- Build & Serve: Vite')
    expect(isSearchReplaceResultDestructive(disk, patched, '/docs/overview.md')).toBe(false)
  })

  it('repairs partial Tech Stack section into full overview.md', () => {
    const onDisk = `# TaskBoard Overview  

## Key Features 

- Create tasks

## Tech Stack (planned) 

- Frontend: Likely React 
- Backend: To be determined  

The goal is to provide a lightweight, visual way to track tasks and workflows.`
    const partial = `## Tech Stack (planned)

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Served with Vite`
    const repaired = tryRepairMarkdownProposalFromDisk(onDisk, partial, '/docs/overview.md')
    expect(repaired).not.toBeNull()
    expect(repaired).toContain('## Key Features')
    expect(repaired).toContain('React + TypeScript')
    expect(repaired).toContain('The goal is to provide')
  })

  it('repairs glued one-line stub that mentions every section title', () => {
    const crushed =
      '# TaskBoard Overview ## Key Features - Create tasks ## Tech Stack (planned) - Frontend: React + TypeScript - Backend: Node + TS'
    const repaired = tryRepairMarkdownProposalFromDisk(original, crushed, '/proj/docs/overview.md')
    expect(repaired).not.toBeNull()
    expect(repaired).toContain('React + TypeScript')
    expect(repaired).toContain('## Key Features')
  })

  it('diagnostics explain repair skip for proposal with no H2 headings', () => {
    const doc = `# App

## Alpha
- keep

## Beta
- old
`
    const diag = diagnoseMarkdownProposalRepair(doc, '- only bullets\n- no headings', '/proj/readme.md')
    expect(diag.repaired).toBeNull()
    expect(diag.repairSkipReason).toBe('no_h2_in_proposal')
    expect(formatMarkdownProposalDiagnostics(diag)).toContain('repairSkip=no_h2_in_proposal')
  })

  it('repairs bullet-only tech stack lines without section headings', () => {
    const bullets = `- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Development server: Vite`
    const repaired = tryRepairMarkdownProposalFromDisk(original, bullets, '/proj/docs/overview.md')
    expect(repaired).not.toBeNull()
    expect(repaired).toContain('React + TypeScript')
    expect(repaired).toContain('## Key Features')
    expect(repaired).not.toContain('Likely React')
  })

  it('uses title-only rejection reason when tool sent only the h1 line', () => {
    expect(isTitleOnlyMarkdownStub(original, '# TaskBoard Overview')).toBe(true)
    expect(resolveCrushedMarkdownRejectionReason(original, '# TaskBoard Overview', '/x.md')).toBe(
      TITLE_ONLY_MARKDOWN_STUB_REASON,
    )
    const diag = diagnoseMarkdownProposalRepair(original, '# TaskBoard Overview', '/proj/docs/overview.md')
    expect(diag.repairSkipReason).toBe('title_only_stub')
  })
})
