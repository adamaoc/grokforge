import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShadowRepo } from '../shadow-repo'

describe('ShadowRepo', () => {
  let base = ''
  let work = ''
  let repo: ShadowRepo

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'gf-shadow-'))
    work = join(base, 'work')
    mkdirSync(join(work, 'src'), { recursive: true })
    writeFileSync(join(work, 'README.md'), '# Demo\n')
    writeFileSync(join(work, 'src', 'app.js'), 'console.log(1)\n')
    writeFileSync(join(work, '.gitignore'), 'secret.txt\n')
    writeFileSync(join(work, 'secret.txt'), 'ignored\n')
    mkdirSync(join(work, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(work, 'node_modules', 'pkg', 'index.js'), 'x\n')
    repo = new ShadowRepo(join(base, 'shadow', 'root.git'), work, ['*.tmp'])
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('reports added, modified and deleted files with line counts', async () => {
    const cp = await repo.snapshot('before')
    writeFileSync(join(work, 'README.md'), '# Demo\n\nMore.\n')
    writeFileSync(join(work, 'src', 'new.js'), 'a\nb\n')
    rmSync(join(work, 'src', 'app.js'))
    writeFileSync(join(work, 'secret.txt'), 'changed\n')
    writeFileSync(join(work, 'scratch.tmp'), 'x\n')
    writeFileSync(join(work, 'node_modules', 'pkg', 'index.js'), 'y\n')

    const changes = await repo.changesSince(cp)
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]))
    expect(Object.keys(byPath).sort()).toEqual(['README.md', 'src/app.js', 'src/new.js'])
    expect(byPath['README.md']).toMatchObject({ status: 'modified', additions: 2, deletions: 0 })
    expect(byPath['src/new.js']).toMatchObject({ status: 'added', additions: 2 })
    expect(byPath['src/app.js']).toMatchObject({ status: 'deleted', deletions: 1 })
  })

  it('reverts selected files and removes files added after the checkpoint', async () => {
    const cp = await repo.snapshot('before')
    writeFileSync(join(work, 'README.md'), 'changed\n')
    writeFileSync(join(work, 'src', 'new.js'), 'new\n')
    rmSync(join(work, 'src', 'app.js'))

    await repo.revert(cp, ['README.md'])
    expect(readFileSync(join(work, 'README.md'), 'utf8')).toBe('# Demo\n')
    expect(existsSync(join(work, 'src', 'new.js'))).toBe(true)

    await repo.revert(cp, [])
    expect(existsSync(join(work, 'src', 'new.js'))).toBe(false)
    expect(readFileSync(join(work, 'src', 'app.js'), 'utf8')).toBe('console.log(1)\n')
    expect(await repo.changesSince(cp)).toEqual([])
  })

  it('reads file contents at the checkpoint', async () => {
    const cp = await repo.snapshot('before')
    writeFileSync(join(work, 'README.md'), 'changed\n')
    expect((await repo.fileAt(cp, 'README.md'))?.toString('utf8')).toBe('# Demo\n')
    expect(await repo.fileAt(cp, 'missing.txt')).toBeNull()
  })

  it('refuses paths outside the work tree', async () => {
    const cp = await repo.snapshot('before')
    await expect(repo.revert(cp, ['../outside.txt'])).rejects.toThrow(/escapes/)
  })

  it('never touches the user repository in the work tree', async () => {
    execFileSync('git', ['init', '-q'], { cwd: work })
    const cp = await repo.snapshot('before')
    writeFileSync(join(work, 'README.md'), 'changed\n')
    await repo.changesSince(cp)
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: work, encoding: 'utf8' })
    // Everything is still untracked in the user's repo: the shadow repo staged nothing there.
    expect(status).toContain('?? README.md')
    expect(status).not.toMatch(/^A /m)
  })
})
