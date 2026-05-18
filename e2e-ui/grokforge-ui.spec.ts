import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = path.join(repoRoot, 'dist/main/main.js')

type Fixture = {
  baseDir: string
  userDataDir: string
  workspaceDir: string
  srcDir: string
  appFile: string
  notesFile: string
  agentFile: string
}

function makeFixture(): Fixture {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'grokforge-e2e-ui-'))
  const userDataDir = path.join(baseDir, 'user-data')
  const workspaceDir = path.join(baseDir, 'workspace')
  const srcDir = path.join(workspaceDir, 'src')
  const docsDir = path.join(workspaceDir, 'docs')
  mkdirSync(srcDir, { recursive: true })
  mkdirSync(docsDir, { recursive: true })
  mkdirSync(path.join(workspaceDir, 'node_modules', 'ignored-lib'), { recursive: true })

  const appFile = path.join(srcDir, 'App.tsx')
  const notesFile = path.join(docsDir, 'notes.md')
  const agentFile = path.join(srcDir, 'agent-output.txt')

  writeFileSync(
    appFile,
    [
      "export function App() {",
      "  return <main>Initial GrokForge fixture</main>",
      "}",
      "",
    ].join('\n'),
  )
  writeFileSync(
    notesFile,
    [
      '# Fixture notes',
      '',
      'The phrase needle-037-search-result should be found by workspace search.',
      '',
    ].join('\n'),
  )
  writeFileSync(path.join(workspaceDir, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node -e "console.log(\\"safe fixture test\\")"',
    },
  }, null, 2))
  writeFileSync(path.join(workspaceDir, 'node_modules', 'ignored-lib', 'secret.txt'), 'needle-037-search-result')

  return { baseDir, userDataDir, workspaceDir, srcDir, appFile, notesFile, agentFile }
}

function mockAgentReply(agentFile: string): string {
  return [
    'I can prepare that file update for you.',
    '',
    '```grokforge-agent-tools',
    JSON.stringify({
      version: 1,
      operations: [
        {
          op: 'write_file',
          path: agentFile,
          content: 'written by mocked E2E agent\n',
        },
      ],
    }, null, 2),
    '```',
    '',
  ].join('\n')
}

async function launchApp(fixture: Fixture): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env }
  if (env.FORCE_COLOR) delete env.NO_COLOR
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [mainEntry],
    env: {
      ...env,
      NODE_ENV: 'test',
      GROKFORGE_E2E_USER_DATA_DIR: fixture.userDataDir,
      GROKFORGE_E2E_OPEN_PROJECT_PATH: fixture.workspaceDir,
      GROKFORGE_E2E_AGENT_REPLY: mockAgentReply(fixture.agentFile),
      XAI_API_KEY: '',
      GROKFORGE_XAI_API_KEY: '',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  page.setDefaultTimeout(10_000)
  return { app, page }
}

async function openFixtureProject(page: Page, fixture: Fixture): Promise<void> {
  await page.getByRole('button', { name: /open project or create new/i }).click()
  await expect(page.getByText('WORKSPACE ROOTS')).toBeVisible()
  await expect(page.getByText(path.basename(fixture.workspaceDir)).first()).toBeVisible()
  await page.getByRole('button', { name: path.basename(fixture.workspaceDir), exact: true }).first().click()
}

test.describe('GrokForge Electron UI E2E', () => {
  let fixture: Fixture
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async () => {
    fixture = makeFixture()
    const launched = await launchApp(fixture)
    app = launched.app
    page = launched.page
  })

  test.afterEach(async () => {
    await app?.close().catch(() => undefined)
    rmSync(fixture.baseDir, { recursive: true, force: true })
  })

  test('opens an isolated project and edits a file on disk', async () => {
    await openFixtureProject(page, fixture)

    await page.getByRole('button', { name: 'src' }).click()
    await page.getByRole('button', { name: 'App.tsx' }).click()
    await expect(page.getByText('App.tsx').last()).toBeVisible()

    await page.locator('.monaco-editor').first().click({ position: { x: 80, y: 80 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type('export const message = "edited from Playwright UI";\n')
    await page.getByRole('button', { name: /save/i }).click()

    await expect.poll(() => readFileSync(fixture.appFile, 'utf-8')).toContain('edited from Playwright UI')
  })

  test('searches, mocks chat, applies a pending write, and persists chat across relaunch', async () => {
    await openFixtureProject(page, fixture)

    await page.getByRole('button', { name: /^Search$/ }).click()
    await page.getByPlaceholder('Search…').fill('needle-037-search-result')
    await page.getByRole('button', { name: /^Search$/ }).last().click()
    await page.getByText(fixture.notesFile).click()
    await expect(page.getByText('notes.md').last()).toBeVisible()

    await page.getByPlaceholder('Ask GrokForge anything about your project...').fill('please write the mocked file')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Pending file updates')).toBeVisible()
    await expect(page.getByText(fixture.agentFile)).toBeVisible()
    await page.getByRole('button', { name: 'Apply all' }).click()
    await expect.poll(() => readFileSync(fixture.agentFile, 'utf-8')).toBe('written by mocked E2E agent\n')

    await app.close()
    const relaunched = await launchApp(fixture)
    app = relaunched.app
    page = relaunched.page
    await page
      .getByRole('button', { name: new RegExp(`${path.basename(fixture.workspaceDir)}.*1 root`) })
      .click()
    await expect(page.getByText('please write the mocked file')).toBeVisible()
    await expect(page.getByText('I can prepare that file update for you.')).toBeVisible()
  })

  test('renders settings and exercises terminal policy UI', async () => {
    await openFixtureProject(page, fixture)

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText('xAI API key')).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()

    await page.getByRole('button', { name: /^Terminal$/ }).click()
    await page.getByPlaceholder('npm run typecheck').fill('printf gf-terminal-ok')
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByText('gf-terminal-ok')).toBeVisible()

    await page.getByPlaceholder('npm run typecheck').fill('rm -rf ./tmp-e2e-risk')
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByRole('heading', { name: 'Potentially destructive command' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByPlaceholder('npm run typecheck').fill('rm -rf /')
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByText(/targeting \/ is not allowed/i).first()).toBeVisible()
  })
})
