import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import {
  flushWorkspaceFilesystemRefreshForTests,
  resetWorkspaceFilesystemRefreshForTests,
  scheduleWorkspaceFilesystemRefresh,
  setWorkspaceFsNotifyTargetWindow,
} from './workspace-fs-notify'

vi.mock('../harness/context/index-store', () => ({
  refreshWorkspaceIndex: vi.fn(),
}))

import { refreshWorkspaceIndex } from '../harness/context/index-store'

const manifest: GrokProjectManifest = {
  name: 'Test',
  roots: [{ id: 'r1', label: 'Root', path: '/tmp/workspace' }],
  ignore: [],
  models: {},
  voice: { defaultVoiceMode: 'off' },
}

describe('scheduleWorkspaceFilesystemRefresh', () => {
  beforeEach(() => {
    resetWorkspaceFilesystemRefreshForTests()
    vi.mocked(refreshWorkspaceIndex).mockClear()
  })

  afterEach(() => {
    resetWorkspaceFilesystemRefreshForTests()
  })

  it('refreshes index without renderer notify by default', () => {
    scheduleWorkspaceFilesystemRefresh({ projectId: 'p1', manifest })
    flushWorkspaceFilesystemRefreshForTests()
    expect(refreshWorkspaceIndex).toHaveBeenCalledWith('p1', manifest)
  })

  it('sends workspace-fs-changed when notifyRenderer is true', () => {
    const send = vi.fn()
    setWorkspaceFsNotifyTargetWindow({
      webContents: { send },
    } as never)

    scheduleWorkspaceFilesystemRefresh({
      projectId: 'p1',
      manifest,
      paths: ['/tmp/workspace'],
      notifyRenderer: true,
      reason: 'agent_command',
    })
    flushWorkspaceFilesystemRefreshForTests()

    expect(send).toHaveBeenCalledWith('workspace-fs-changed', {
      paths: ['/tmp/workspace'],
      reason: 'agent_command',
    })
  })

  it('coalesces paths across debounced calls', () => {
    const send = vi.fn()
    setWorkspaceFsNotifyTargetWindow({
      webContents: { send },
    } as never)

    scheduleWorkspaceFilesystemRefresh({
      projectId: 'p1',
      manifest,
      paths: ['/tmp/a'],
      notifyRenderer: true,
      reason: 'agent_command',
    })
    scheduleWorkspaceFilesystemRefresh({
      projectId: 'p1',
      manifest,
      paths: ['/tmp/b'],
      notifyRenderer: true,
      reason: 'agent_command',
    })
    flushWorkspaceFilesystemRefreshForTests()

    expect(refreshWorkspaceIndex).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('workspace-fs-changed', {
      paths: expect.arrayContaining(['/tmp/a', '/tmp/b']),
      reason: 'agent_command',
    })
  })
})
