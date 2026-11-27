import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * External coding agent (ACP) flow against a scripted mock agent: pick the agent in
 * Settings, send a message, review the proposed diff, allow it, and see the file change.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = path.join(repoRoot, 'dist/main/main.js')
const mockAgent = path.join(repoRoot, 'e2e-ui/fixtures/mock-acp-agent.mjs')

type Fixture = { baseDir: string; userDataDir: string; workspaceDir: string; readme: string }

function makeFixture(): Fixture {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'grokforge-e2e-acp-'))
  const userDataDir = path.join(baseDir, 'user-data')
  const workspaceDir = path.join(baseDir, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  const readme = path.join(workspaceDir, 'README.md')
  writeFileSync(readme, '# Fixture app\n\nA tiny demo project.\n')
  return { baseDir, userDataDir, workspaceDir, readme }
}

async function launchApp(fixture: Fixture): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env }
  if (env.FORCE_COLOR) delete env.NO_COLOR
  delete env.GROKFORGE_E2E_AGENT_REPLY
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [mainEntry],
    env: {
      ...env,
      NODE_ENV: 'test',
      GROKFORGE_E2E_USER_DATA_DIR: fixture.userDataDir,
      GROKFORGE_E2E_OPEN_PROJECT_PATH: fixture.workspaceDir,
      GROKFORGE_ACP_AGENT_OVERRIDE: mockAgent,
      XAI_API_KEY: '',
      GROKFORGE_XAI_API_KEY: '',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  page.setDefaultTimeout(15_000)
  return { app, page }
}

async function openProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open project or create new/i }).click()
  await expect(page.getByTestId('sidebar').getByText('WORKSPACE ROOTS')).toBeVisible({ timeout: 20_000 })
  const dialog = page.getByRole('dialog', { name: 'How GrokForge works' })
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
  }
}

test.describe('External coding agent (ACP)', () => {
  let fixture: Fixture
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async () => {
    fixture = makeFixture()
    ;({ app, page } = await launchApp(fixture))
  })

  test.afterEach(async () => {
    await app?.close().catch(() => undefined)
    rmSync(fixture.baseDir, { recursive: true, force: true })
  })

  test('selects Claude Code, reviews the proposed diff, and applies it', async () => {
    await openProject(page)

    await page.getByRole('button', { name: 'Settings' }).click()
    const section = page.getByTestId('settings-coding-agent')
    await expect(section.getByRole('radio', { name: 'Grok Build' })).toBeVisible()
    await section.getByRole('radio', { name: 'Claude Code' }).click()
    await expect(section.getByRole('radio', { name: 'Claude Code' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Back' }).click()

    await expect(page.getByTestId('active-coding-agent')).toContainText('Claude Code')
    await page.getByPlaceholder('Ask GrokForge anything about your project...').fill('Add setup instructions to the README')
    await page.getByRole('button', { name: 'Send message' }).click()

    const card = page.locator('[data-agent-command-approval]')
    await expect(card.getByText('Claude Code wants to edit a file')).toBeVisible()
    await expect(card.locator('[data-agent-permission-diff]')).toContainText('README.md')
    await expect(card.locator('[data-agent-permission-diff]')).toContainText('## Getting started')
    expect(readFileSync(fixture.readme, 'utf8')).not.toContain('Getting started')

    await card.getByRole('button', { name: 'Allow edit' }).click()
    await expect(page.getByText('Added the section to')).toBeVisible()
    await expect.poll(() => readFileSync(fixture.readme, 'utf8')).toContain('## Getting started')

    // The turn's changes are listed against a checkpoint and can be undone.
    const changes = page.locator('[data-turn-changes]')
    await expect(changes).toContainText('Changed 1 file')
    await expect(changes).toContainText('README.md')
    await changes.getByText('README.md', { exact: true }).click()
    await expect(changes).toContainText('## Getting started')
    await changes.getByRole('button', { name: 'Undo turn' }).click()
    await changes.getByRole('button', { name: 'Undo turn' }).click()
    await expect(changes).toContainText('All changes reverted')
    await expect.poll(() => readFileSync(fixture.readme, 'utf8')).toBe('# Fixture app\n\nA tiny demo project.\n')
  })

  test('searches the workspace and keeps the chat across a relaunch', async () => {
    await openProject(page)

    await page.getByRole('button', { name: /^Search$/ }).click()
    await page.getByPlaceholder('Search…').fill('tiny demo project')
    await page.getByRole('button', { name: /^Search$/ }).last().click()
    await expect(page.getByText('README.md').last()).toBeVisible()

    await page.getByPlaceholder('Ask GrokForge anything about your project...').fill('Add setup instructions')
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.locator('[data-agent-command-approval]').getByRole('button', { name: 'Allow edit' }).click()
    await expect(page.getByText('Added the section to')).toBeVisible()

    await app.close()
    ;({ app, page } = await launchApp(fixture))
    await page.getByRole('button', { name: `Open project ${path.basename(fixture.workspaceDir)}` }).click()
    await expect(page.getByText('Add setup instructions', { exact: true })).toBeVisible()
    await expect(page.getByText('Added the section to')).toBeVisible()
  })

  test('rejecting the edit leaves the file unchanged', async () => {
    await openProject(page)
    await page.getByPlaceholder('Ask GrokForge anything about your project...').fill('Add setup instructions')
    await page.getByRole('button', { name: 'Send message' }).click()

    const card = page.locator('[data-agent-command-approval]')
    await expect(card.getByText('Grok Build wants to edit a file')).toBeVisible()
    await card.getByRole('button', { name: 'Reject' }).click()
    await expect(page.getByText('I left')).toBeVisible()
    expect(readFileSync(fixture.readme, 'utf8')).not.toContain('Getting started')
  })
})
