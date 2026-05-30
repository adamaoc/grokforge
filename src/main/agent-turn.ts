/**
 * AgentTurn — a small step toward Pi-style explicit turn lifecycle.
 *
 * Goals (inspired by Pi's AgentHarness + turn snapshots):
 * - Make it explicit what is "frozen for the current provider round" (the snapshot)
 *   vs what is "pending mutation that will affect the next round or final answer".
 * - Centralize per-turn mutable state so the big loop in agent-runner.ts becomes easier to reason about.
 * - Provide clear hooks for "save point" style behavior later (after tool results complete).
 *
 * This is intentionally incremental. We are not rewriting the entire runner yet.
 */

import type { AgentEditProposalPayload } from '../shared/agent-chat-contract'

export type AgentTurnMutableState = {
  totalToolChars: number
  editProposalCreated: boolean
  turnProposalAccum: AgentEditProposalPayload | null
  searchReplaceFailuresByPath: Map<string, number>
  incompleteHtmlFailuresByPath: Map<string, number>
  creationIntegrityFailuresByPath: Map<string, number>
  crushedJavaScriptFailuresByPath: Map<string, number>
  proposalRejectionsByPath: Map<string, number>

  // Nudge / escalation flags for this turn
  searchReplaceEscalationNudgeIssued: boolean
  incompleteHtmlNudgeIssued: boolean
  creationIncrementalRecoveryIssued: boolean
  crushedJavaScriptNudgeIssued: boolean
  partialBatchNudgeCount: number
  discoverySaturationNudgeIssued: boolean
  planVerifyCommandNudgeIssued: boolean
  scaffoldStrategyNudgeIssued: boolean

  // Counters and tracking
  toolRoundCount: number
  postEscalationToolRounds: number
  searchReplaceBlockedAfterEscalationCount: number
  readOnlyRoundsAfterFirstEdit: number

  // Other turn-local accumulators
  commandToolSucceeded: boolean
  commandToolFailed: boolean
  scaffoldMutatingCommandSucceeded: boolean
  rereadLoopDetected: boolean

  // For future save-point style flushing
  pendingTurnMutations: boolean
}

export class AgentTurn {
  private mutable: AgentTurnMutableState

  constructor(initial?: Partial<AgentTurnMutableState>) {
    this.mutable = {
      totalToolChars: 0,
      editProposalCreated: false,
      turnProposalAccum: null,
      searchReplaceFailuresByPath: new Map(),
      incompleteHtmlFailuresByPath: new Map(),
      creationIntegrityFailuresByPath: new Map(),
      crushedJavaScriptFailuresByPath: new Map(),
      proposalRejectionsByPath: new Map(),

      searchReplaceEscalationNudgeIssued: false,
      incompleteHtmlNudgeIssued: false,
      creationIncrementalRecoveryIssued: false,
      crushedJavaScriptNudgeIssued: false,
      partialBatchNudgeCount: 0,
      discoverySaturationNudgeIssued: false,
      planVerifyCommandNudgeIssued: false,
      scaffoldStrategyNudgeIssued: false,

      toolRoundCount: 0,
      postEscalationToolRounds: 0,
      searchReplaceBlockedAfterEscalationCount: 0,
      readOnlyRoundsAfterFirstEdit: 0,

      commandToolSucceeded: false,
      commandToolFailed: false,
      scaffoldMutatingCommandSucceeded: false,
      rereadLoopDetected: false,

      pendingTurnMutations: false,

      ...initial,
    }
  }

  get state(): Readonly<AgentTurnMutableState> {
    return this.mutable
  }

  // --- Mutation recording (these are the "pending" changes during a turn) ---

  recordEditProposal(proposal: AgentEditProposalPayload | null, composedInTurn = false): void {
    this.mutable.editProposalCreated = true
    this.mutable.turnProposalAccum = proposal
    if (composedInTurn) {
      // Could track more here later
    }
    this.mutable.pendingTurnMutations = true
  }

  recordSearchReplaceFailure(resolvedPath: string): void {
    const key = resolvedPath
    const current = this.mutable.searchReplaceFailuresByPath.get(key) ?? 0
    this.mutable.searchReplaceFailuresByPath.set(key, current + 1)
    this.mutable.pendingTurnMutations = true
  }

  recordSearchReplaceBlocked(): void {
    this.mutable.searchReplaceBlockedAfterEscalationCount += 1
    this.mutable.pendingTurnMutations = true
  }

  recordProposalRejection(resolvedPath: string): void {
    const key = resolvedPath.replace(/\\/g, '/')
    this.mutable.proposalRejectionsByPath.set(key, (this.mutable.proposalRejectionsByPath.get(key) ?? 0) + 1)
    this.mutable.pendingTurnMutations = true
  }

  // Add more recordX methods as we migrate state out of the runner

  incrementToolRound(): void {
    this.mutable.toolRoundCount += 1
  }

  markNudgeIssued(kind: 'searchReplaceEscalation' | 'discoverySaturation' | 'incompleteHtml' | 'planVerify'): void {
    switch (kind) {
      case 'searchReplaceEscalation':
        this.mutable.searchReplaceEscalationNudgeIssued = true
        break
      case 'discoverySaturation':
        this.mutable.discoverySaturationNudgeIssued = true
        break
      case 'incompleteHtml':
        this.mutable.incompleteHtmlNudgeIssued = true
        break
      case 'planVerify':
        this.mutable.planVerifyCommandNudgeIssued = true
        break
    }
    this.mutable.pendingTurnMutations = true
  }

  // --- Queries that the runner / final answer logic cares about ---

  hasEditProposal(): boolean {
    return this.mutable.editProposalCreated
  }

  getAccumulatedProposal(): AgentEditProposalPayload | null {
    return this.mutable.turnProposalAccum
  }

  totalSearchReplaceFailures(): number {
    let sum = 0
    for (const v of this.mutable.searchReplaceFailuresByPath.values()) sum += v
    return sum
  }

  // Future: this is where "should we create a new snapshot with updated pending state?" logic can live

  /**
   * Call this after a tool result round completes (analogous to Pi save point).
   * Currently a no-op placeholder — we can evolve it to flush things or prepare the next snapshot view.
   */
  onToolRoundComplete(): void {
    // Placeholder for future "save point" behavior
    // e.g. decide if we should materialize pending proposal state into something snapshot-visible
    if (this.mutable.pendingTurnMutations) {
      // For now we just clear the flag. Real logic comes later.
      this.mutable.pendingTurnMutations = false
    }
  }

  /**
   * Reset for a brand new user turn (not a continuation within the same agent run).
   */
  resetForNewUserTurn(): void {
    this.mutable = {
      totalToolChars: 0,
      editProposalCreated: false,
      turnProposalAccum: null,
      searchReplaceFailuresByPath: new Map(),
      incompleteHtmlFailuresByPath: new Map(),
      creationIntegrityFailuresByPath: new Map(),
      crushedJavaScriptFailuresByPath: new Map(),
      proposalRejectionsByPath: new Map(),

      searchReplaceEscalationNudgeIssued: false,
      incompleteHtmlNudgeIssued: false,
      creationIncrementalRecoveryIssued: false,
      crushedJavaScriptNudgeIssued: false,
      partialBatchNudgeCount: 0,
      discoverySaturationNudgeIssued: false,
      planVerifyCommandNudgeIssued: false,
      scaffoldStrategyNudgeIssued: false,

      toolRoundCount: 0,
      postEscalationToolRounds: 0,
      searchReplaceBlockedAfterEscalationCount: 0,
      readOnlyRoundsAfterFirstEdit: 0,

      commandToolSucceeded: false,
      commandToolFailed: false,
      scaffoldMutatingCommandSucceeded: false,
      rereadLoopDetected: false,

      pendingTurnMutations: false,
    }
  }
}
