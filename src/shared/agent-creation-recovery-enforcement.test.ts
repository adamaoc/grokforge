import { describe, expect, it } from 'vitest'
import {
  AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON,
  AGENT_EDIT_SINGLE_FILE_HTML_SHELL_FIRST_REASON,
  assessCreationRecoveryBootstrapBlock,
  creationRecoveryUnmetPathLabels,
  CREATION_RECOVERY_MAX_SCAFFOLD_CHARS,
  CREATION_RECOVERY_MAX_SCAFFOLD_LINES,
  isCreationRecoveryEnforced,
  isCreationScaffoldAccepted,
  isOversizedCreationBootstrap,
  normalizeCreationRecoveryPath,
  qualifiesAsCreationRecoveryScaffold,
  recordCreationRecoveryEnforced,
  recordCreationScaffoldAccepted,
} from '../harness/policy/edit/creation-recovery'

describe('agent-creation-recovery-enforcement', () => {
  it('normalizes paths with backslashes', () => {
    expect(normalizeCreationRecoveryPath('\\proj\\index.html')).toBe('/proj/index.html')
  })

  it('detects oversized bootstrap by line count', () => {
    const content = `${'line\n'.repeat(CREATION_RECOVERY_MAX_SCAFFOLD_LINES)}extra`
    expect(isOversizedCreationBootstrap(content)).toBe(true)
  })

  it('detects oversized bootstrap by char count', () => {
    const content = 'x'.repeat(CREATION_RECOVERY_MAX_SCAFFOLD_CHARS + 1)
    expect(isOversizedCreationBootstrap(content)).toBe(true)
  })

  it('allows small scaffold content', () => {
    const content = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>App</title></head>
<body><div id="app"></div></body>
</html>`
    expect(isOversizedCreationBootstrap(content)).toBe(false)
  })

  it('blocks oversized bootstrap on enforced new path', () => {
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    const large = `${'// line\n'.repeat(40)}`
    const result = assessCreationRecoveryBootstrapBlock({
      content: large,
      resolvedPath: '/proj/index.html',
      fileExistsOnDisk: false,
      creationRecoveryEnforcedPaths: enforced,
      creationScaffoldAcceptedPaths: new Set(),
      contentSource: 'propose',
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe(AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON)
  })

  it('allows small scaffold on enforced new path', () => {
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    const small = '<!DOCTYPE html><html><body></body></html>'
    const result = assessCreationRecoveryBootstrapBlock({
      content: small,
      resolvedPath: '/proj/index.html',
      fileExistsOnDisk: false,
      creationRecoveryEnforcedPaths: enforced,
      creationScaffoldAcceptedPaths: new Set(),
      contentSource: 'propose',
    })
    expect(result.blocked).toBe(false)
  })

  it('does not block after scaffold accepted', () => {
    const enforced = new Set<string>()
    const accepted = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    recordCreationScaffoldAccepted(accepted, '/proj/index.html')
    const large = `${'// line\n'.repeat(40)}`
    const result = assessCreationRecoveryBootstrapBlock({
      content: large,
      resolvedPath: '/proj/index.html',
      fileExistsOnDisk: false,
      creationRecoveryEnforcedPaths: enforced,
      creationScaffoldAcceptedPaths: accepted,
      contentSource: 'propose',
    })
    expect(result.blocked).toBe(false)
  })

  it('does not block existing files or search_replace', () => {
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    const large = `${'// line\n'.repeat(40)}`
    expect(
      assessCreationRecoveryBootstrapBlock({
        content: large,
        resolvedPath: '/proj/index.html',
        fileExistsOnDisk: true,
        creationRecoveryEnforcedPaths: enforced,
        contentSource: 'propose',
      }).blocked,
    ).toBe(false)
    expect(
      assessCreationRecoveryBootstrapBlock({
        content: large,
        resolvedPath: '/proj/index.html',
        fileExistsOnDisk: false,
        creationRecoveryEnforcedPaths: enforced,
        contentSource: 'search_replace',
      }).blocked,
    ).toBe(false)
  })

  it('tracks enforced and accepted path sets', () => {
    const enforced = new Set<string>()
    const accepted = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['\\proj\\a.js', '/proj/b.js'])
    expect(isCreationRecoveryEnforced(enforced, '/proj/a.js')).toBe(true)
    recordCreationScaffoldAccepted(accepted, '\\proj\\a.js')
    expect(isCreationScaffoldAccepted(accepted, '/proj/a.js')).toBe(true)
  })

  it('blocks inline script before scaffold on enforced new html with single-file intent (162)', () => {
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    const withScript = `<!DOCTYPE html>
<html><head><title>T</title></head>
<body><div id="app"></div>
<script>const x = 1</script>
</body></html>`
    const result = assessCreationRecoveryBootstrapBlock({
      content: withScript,
      resolvedPath: '/proj/index.html',
      fileExistsOnDisk: false,
      creationRecoveryEnforcedPaths: enforced,
      creationScaffoldAcceptedPaths: new Set(),
      contentSource: 'propose',
      singleFileHtmlIntent: true,
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe(AGENT_EDIT_SINGLE_FILE_HTML_SHELL_FIRST_REASON)
  })

  it('allows small script-free html shell with single-file intent (162)', () => {
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    const shell = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Board</title></head>
<body><div id="board"></div></body>
</html>`
    const result = assessCreationRecoveryBootstrapBlock({
      content: shell,
      resolvedPath: '/proj/index.html',
      fileExistsOnDisk: false,
      creationRecoveryEnforcedPaths: enforced,
      creationScaffoldAcceptedPaths: new Set(),
      contentSource: 'propose',
      singleFileHtmlIntent: true,
    })
    expect(result.blocked).toBe(false)
    expect(
      qualifiesAsCreationRecoveryScaffold({
        content: shell,
        resolvedPath: '/proj/index.html',
        fileExistsOnDisk: false,
        singleFileHtmlIntent: true,
      }),
    ).toBe(true)
  })

  it('does not apply shell-first gate without single-file html intent', () => {
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, ['/proj/index.html'])
    const withScript = '<!DOCTYPE html><html><body><script>x</script></body></html>'
    const result = assessCreationRecoveryBootstrapBlock({
      content: withScript,
      resolvedPath: '/proj/index.html',
      fileExistsOnDisk: false,
      creationRecoveryEnforcedPaths: enforced,
      creationScaffoldAcceptedPaths: new Set(),
      contentSource: 'propose',
      singleFileHtmlIntent: false,
    })
    expect(result.blocked).toBe(false)
  })

  it('lists unmet recovery path labels', () => {
    const enforced = new Set<string>(['/proj/index.html', '/proj/script.js'])
    const accepted = new Set<string>()
    recordCreationScaffoldAccepted(accepted, '/proj/index.html')
    expect(
      creationRecoveryUnmetPathLabels({
        creationRecoveryEnforcedPaths: enforced,
        creationScaffoldAcceptedPaths: accepted,
      }),
    ).toEqual(['script.js'])
  })
})
