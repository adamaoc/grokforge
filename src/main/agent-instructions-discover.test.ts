import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  discoverAgentInstructionRelativePaths,
  mergeDiscoveredAgentInstructions,
} from '../harness/context/instructions-discover'

describe('discoverAgentInstructionRelativePaths', () => {
  it('finds AGENTS.md at root and CLAUDE.md one level deep', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agentdisc-'))
    writeFileSync(join(root, 'AGENTS.md'), '# agents')
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs', 'CLAUDE.md'), '# claude')

    const paths = discoverAgentInstructionRelativePaths([{ path: root }], ['**/node_modules'])
    expect(paths).toContain('AGENTS.md')
    expect(paths).toContain('docs/CLAUDE.md')
  })

  it('matches instruction basenames case-insensitively', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agentdisc-case-'))
    writeFileSync(join(root, 'Agents.md'), 'x')

    const paths = discoverAgentInstructionRelativePaths([{ path: root }], [])
    expect(paths).toContain('Agents.md')
  })

  it('skips files under ignored immediate child directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agentdisc-ign-'))
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'AGENTS.md'), 'no')

    const paths = discoverAgentInstructionRelativePaths([{ path: root }], ['**/node_modules'])
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
  })

  it('does not read two levels below root', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agentdisc-deep-'))
    mkdirSync(join(root, 'a', 'b'), { recursive: true })
    writeFileSync(join(root, 'a', 'b', 'AGENTS.md'), 'deep')

    const paths = discoverAgentInstructionRelativePaths([{ path: root }], [])
    expect(paths.some((p) => p.includes('AGENTS.md'))).toBe(false)
  })
})

describe('mergeDiscoveredAgentInstructions', () => {
  it('dedupes with existing entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agentdisc-merge-'))
    writeFileSync(join(root, 'AGENTS.md'), '# x')

    const merged = mergeDiscoveredAgentInstructions(['AGENTS.md', ' custom.md '], [{ path: root }], [])
    expect(merged).toContain('AGENTS.md')
    expect(merged).toContain('custom.md')
    expect(merged.filter((x) => x === 'AGENTS.md').length).toBe(1)
  })
})
