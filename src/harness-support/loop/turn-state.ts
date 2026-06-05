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

import type { AgentEditProposalPayload } from '../../shared/agent-chat-contract'

export type AgentTurnNudgeKind =
  | 'searchReplaceEscalation'
  | 'discoverySaturation'
  | 'incompleteHtml'
  | 'planVerify'
  | 'creationIncrementalRecovery'
  | 'crushedJavaScript'
  | 'scaffoldStrategy'

export type AgentTurnCommandOutcome = 'succeeded' | 'failed'

export type AgentTurnMutableState = {
  totalToolChars: number
  editProposalCreated: boolean
  turnProposalAccum: AgentEditProposalPayload | null
  searchReplaceFailuresByPath: Map<string, number>
  incompleteHtmlFailuresByPath: Map<string, number>
  creationIntegrityFailuresByPath: Map<string, number>
  crushedJavaScriptFailuresByPath: Map<string, number>
  proposalRejectionsByPath: Map<string, number>
  searchReplaceCountByPath: Map<string, number>
  pathsEditedThisTurn: Set<string>
  pathsReadThisTurn: Set<string>
  creationRecoveryEnforcedPaths: Set<string>
  creationScaffoldAcceptedPaths: Set<string>
  incrementalEditMidTurnNudgesIssued: Set<string>

  // Nudge / escalation flags for this turn
  searchReplaceEscalationNudgeIssued: boolean
  incompleteHtmlNudgeIssued: boolean
  creationIncrementalRecoveryIssued: boolean
  crushedJavaScriptNudgeIssued: boolean
  partialBatchNudgeCount: number
  discoverySaturationNudgeIssued: boolean
  planVerifyCommandNudgeIssued: boolean
  scaffoldStrategyNudgeIssued: boolean
  editIntentToolNudgeIssued: boolean
  scaffoldStrategyRecovered: boolean
  postScaffoldVerificationNudgeIssued: boolean

  // Counters and tracking
  toolRoundCount: number
  postEscalationToolRounds: number
  searchReplaceBlockedAfterEscalationCount: number
  readOnlyRoundsAfterFirstEdit: number

  // Other turn-local accumulators
  commandToolSucceeded: boolean
  commandToolFailed: boolean
  commandToolSampledThisTurn: boolean
  scaffoldMutatingCommandSucceeded: boolean
  editToolsAttemptedThisTurn: boolean
  proposeFileEditsAttempted: boolean
  rereadLoopDetected: boolean
  lastRoundSearchReplaceOnScopedPath: boolean

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
      searchReplaceCountByPath: new Map(),
      pathsEditedThisTurn: new Set(),
      pathsReadThisTurn: new Set(),
      creationRecoveryEnforcedPaths: new Set(),
      creationScaffoldAcceptedPaths: new Set(),
      incrementalEditMidTurnNudgesIssued: new Set(),

      searchReplaceEscalationNudgeIssued: false,
      incompleteHtmlNudgeIssued: false,
      creationIncrementalRecoveryIssued: false,
      crushedJavaScriptNudgeIssued: false,
      partialBatchNudgeCount: 0,
      discoverySaturationNudgeIssued: false,
      planVerifyCommandNudgeIssued: false,
      scaffoldStrategyNudgeIssued: false,
      editIntentToolNudgeIssued: false,
      scaffoldStrategyRecovered: false,
      postScaffoldVerificationNudgeIssued: false,

      toolRoundCount: 0,
      postEscalationToolRounds: 0,
      searchReplaceBlockedAfterEscalationCount: 0,
      readOnlyRoundsAfterFirstEdit: 0,

      commandToolSucceeded: false,
      commandToolFailed: false,
      commandToolSampledThisTurn: false,
      scaffoldMutatingCommandSucceeded: false,
      editToolsAttemptedThisTurn: false,
      proposeFileEditsAttempted: false,
      rereadLoopDetected: false,
      lastRoundSearchReplaceOnScopedPath: false,

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

  recordSearchReplaceAttempt(resolvedPath: string): void {
    const key = resolvedPath
    this.mutable.searchReplaceCountByPath.set(key, (this.mutable.searchReplaceCountByPath.get(key) ?? 0) + 1)
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

  recordIncompleteHtmlFailure(resolvedPath: string): void {
    this.incrementPathCount(this.mutable.incompleteHtmlFailuresByPath, resolvedPath)
  }

  recordCreationIntegrityFailure(resolvedPath: string): void {
    this.incrementPathCount(this.mutable.creationIntegrityFailuresByPath, resolvedPath)
  }

  recordCrushedJavaScriptFailure(resolvedPath: string): void {
    this.incrementPathCount(this.mutable.crushedJavaScriptFailuresByPath, resolvedPath)
  }

  recordPathRead(resolvedPath: string): void {
    this.mutable.pathsReadThisTurn.add(resolvedPath)
    this.mutable.pendingTurnMutations = true
  }

  recordPathEdited(resolvedPath: string): void {
    this.mutable.pathsEditedThisTurn.add(resolvedPath)
    this.mutable.pendingTurnMutations = true
  }

  recordCreationRecoveryEnforced(resolvedPath: string): void {
    this.mutable.creationRecoveryEnforcedPaths.add(resolvedPath)
    this.mutable.pendingTurnMutations = true
  }

  recordCreationScaffoldAccepted(resolvedPath: string): void {
    this.mutable.creationScaffoldAcceptedPaths.add(resolvedPath)
    this.mutable.pendingTurnMutations = true
  }

  recordIncrementalEditMidTurnNudge(kind: string): void {
    this.mutable.incrementalEditMidTurnNudgesIssued.add(kind)
    this.mutable.pendingTurnMutations = true
  }

  incrementToolRound(): void {
    this.mutable.toolRoundCount += 1
    this.mutable.pendingTurnMutations = true
  }

  incrementPostEscalationToolRound(): void {
    this.mutable.postEscalationToolRounds += 1
    this.mutable.pendingTurnMutations = true
  }

  incrementReadOnlyRoundsAfterFirstEdit(): void {
    this.mutable.readOnlyRoundsAfterFirstEdit += 1
    this.mutable.pendingTurnMutations = true
  }

  incrementPartialBatchNudgeCount(): void {
    this.mutable.partialBatchNudgeCount += 1
    this.mutable.pendingTurnMutations = true
  }

  markNudgeIssued(kind: AgentTurnNudgeKind): void {
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
      case 'creationIncrementalRecovery':
        this.mutable.creationIncrementalRecoveryIssued = true
        break
      case 'crushedJavaScript':
        this.mutable.crushedJavaScriptNudgeIssued = true
        break
      case 'scaffoldStrategy':
        this.mutable.scaffoldStrategyNudgeIssued = true
        break
    }
    this.mutable.pendingTurnMutations = true
  }

  recordCommandOutcome(outcome: AgentTurnCommandOutcome): void {
    this.mutable.commandToolSampledThisTurn = true
    if (outcome === 'succeeded') {
      this.mutable.commandToolSucceeded = true
    } else {
      this.mutable.commandToolFailed = true
    }
    this.mutable.pendingTurnMutations = true
  }

  recordEditAttempt(tool: 'propose_file_edits' | 'search_replace' | 'other' = 'other'): void {
    this.mutable.editToolsAttemptedThisTurn = true
    if (tool === 'propose_file_edits') {
      this.mutable.proposeFileEditsAttempted = true
    }
    this.mutable.pendingTurnMutations = true
  }

  markEditIntentToolNudgeIssued(): void {
    this.mutable.editIntentToolNudgeIssued = true
    this.mutable.pendingTurnMutations = true
  }

  markScaffoldStrategyRecovered(): void {
    this.mutable.scaffoldStrategyRecovered = true
    this.mutable.pendingTurnMutations = true
  }

  markPostScaffoldVerificationNudgeIssued(): void {
    this.mutable.postScaffoldVerificationNudgeIssued = true
    this.mutable.pendingTurnMutations = true
  }

  markScaffoldMutatingCommandSucceeded(): void {
    this.mutable.scaffoldMutatingCommandSucceeded = true
    this.mutable.pendingTurnMutations = true
  }

  markRereadLoopDetected(): void {
    this.mutable.rereadLoopDetected = true
    this.mutable.pendingTurnMutations = true
  }

  setLastRoundSearchReplaceOnScopedPath(value: boolean): void {
    this.mutable.lastRoundSearchReplaceOnScopedPath = value
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

  toHarnessMetricsPatch(): {
    toolRoundCount: number
    readOnlyRounds: number
    searchReplaceCountByPath: Map<string, number>
    searchReplaceFailuresByPath: Map<string, number>
    proposalRejectionsByPath: Map<string, number>
    searchReplaceBlockedAfterEscalationCount: number
    rereadLoopDetected: boolean
  } {
    return {
      toolRoundCount: this.mutable.toolRoundCount,
      readOnlyRounds: this.mutable.readOnlyRoundsAfterFirstEdit,
      searchReplaceCountByPath: this.mutable.searchReplaceCountByPath,
      searchReplaceFailuresByPath: this.mutable.searchReplaceFailuresByPath,
      proposalRejectionsByPath: this.mutable.proposalRejectionsByPath,
      searchReplaceBlockedAfterEscalationCount: this.mutable.searchReplaceBlockedAfterEscalationCount,
      rereadLoopDetected: this.mutable.rereadLoopDetected,
    }
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
      searchReplaceCountByPath: new Map(),
      pathsEditedThisTurn: new Set(),
      pathsReadThisTurn: new Set(),
      creationRecoveryEnforcedPaths: new Set(),
      creationScaffoldAcceptedPaths: new Set(),
      incrementalEditMidTurnNudgesIssued: new Set(),

      searchReplaceEscalationNudgeIssued: false,
      incompleteHtmlNudgeIssued: false,
      creationIncrementalRecoveryIssued: false,
      crushedJavaScriptNudgeIssued: false,
      partialBatchNudgeCount: 0,
      discoverySaturationNudgeIssued: false,
      planVerifyCommandNudgeIssued: false,
      scaffoldStrategyNudgeIssued: false,
      editIntentToolNudgeIssued: false,
      scaffoldStrategyRecovered: false,
      postScaffoldVerificationNudgeIssued: false,

      toolRoundCount: 0,
      postEscalationToolRounds: 0,
      searchReplaceBlockedAfterEscalationCount: 0,
      readOnlyRoundsAfterFirstEdit: 0,

      commandToolSucceeded: false,
      commandToolFailed: false,
      commandToolSampledThisTurn: false,
      scaffoldMutatingCommandSucceeded: false,
      editToolsAttemptedThisTurn: false,
      proposeFileEditsAttempted: false,
      rereadLoopDetected: false,
      lastRoundSearchReplaceOnScopedPath: false,

      pendingTurnMutations: false,
    }
  }

  private incrementPathCount(map: Map<string, number>, resolvedPath: string): void {
    const key = resolvedPath.replace(/\\/g, '/')
    map.set(key, (map.get(key) ?? 0) + 1)
    this.mutable.pendingTurnMutations = true
  }
}
