import { ipcMain } from 'electron'
import {
  isAgentProviderId,
  type AgentProvidersResult,
  type SetAgentProviderResult,
} from '../../shared/agent/provider-contract'
import { listAgentProviders, setSelectedAgentProvider } from './provider-registry'
import { disposeAllAcpSessions } from './session-manager'

/** Coding-agent provider picker (Settings). Turns themselves go through `agent-chat-start`. */
export function registerAgentProviderIpc(): void {
  ipcMain.handle(
    'agent-providers-list',
    (_, raw: unknown): Promise<AgentProvidersResult> =>
      listAgentProviders(Boolean(raw && typeof raw === 'object' && (raw as { refresh?: unknown }).refresh)),
  )

  ipcMain.handle('agent-provider-set', (_, raw: unknown): SetAgentProviderResult => {
    if (!isAgentProviderId(raw)) return { ok: false, error: 'Unknown coding agent.' }
    try {
      setSelectedAgentProvider(raw)
      // Switching agents ends live sessions; the next turn starts the chosen CLI.
      disposeAllAcpSessions()
      return { ok: true, selected: raw }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
