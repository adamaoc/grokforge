import { describe, expect, it } from 'vitest'
import {
  AGENT_EDIT_INVALID_JSON_MANIFEST_REASON,
  assessJsonManifestContent,
  isBootstrapManifestPath,
  normalizeJsonManifestContent,
} from '../harness-support/context/bootstrap-manifest'

describe('isBootstrapManifestPath', () => {
  it('matches package.json and vite config', () => {
    expect(isBootstrapManifestPath('/proj/package.json')).toBe(true)
    expect(isBootstrapManifestPath('/proj/vite.config.ts')).toBe(true)
    expect(isBootstrapManifestPath('/proj/tsconfig.json')).toBe(true)
    expect(isBootstrapManifestPath('/proj/index.html')).toBe(false)
  })
})

describe('normalizeJsonManifestContent', () => {
  it('pretty-prints minified valid package.json', () => {
    const minified = '{"name":"todo","private":true,"version":"0.0.0"}'
    const out = normalizeJsonManifestContent(minified, '/proj/package.json')
    expect(out).toContain('"name": "todo"')
    expect(out.split('\n').length).toBeGreaterThan(2)
  })

  it('leaves invalid JSON unchanged for downstream rejection', () => {
    const bad = '{name: todo'
    expect(normalizeJsonManifestContent(bad, '/proj/package.json')).toBe(bad)
  })
})

describe('assessJsonManifestContent', () => {
  it('validation:package_json — accepts parseable minified package.json on new file', () => {
    const r = assessJsonManifestContent('{"name":"app","private":true}', {
      resolvedPath: '/proj/package.json',
      isNewFile: true,
    })
    expect(r.ok).toBe(true)
  })

  it('validation:package_json — rejects invalid JSON on new file with fix strategy', () => {
    const r = assessJsonManifestContent('{name: todo}', {
      resolvedPath: '/proj/package.json',
      isNewFile: true,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain(AGENT_EDIT_INVALID_JSON_MANIFEST_REASON.slice(0, 24))
    expect(r.reason).toMatch(/npm create|npm init|run_command/i)
  })

  it('does not reject invalid JSON on existing file edits (non-bootstrap strict path)', () => {
    const r = assessJsonManifestContent('{broken', {
      resolvedPath: '/proj/package.json',
      isNewFile: false,
    })
    expect(r.ok).toBe(true)
  })
})
