import type { MutableRefObject } from "react";
import type {
  AgentChatAttachment,
  AgentChatEditorSelection,
  AgentContextPin,
  AgentEditProposalRejectedFile,
  AgentProposalReview,
  DiffSession,
  GrokProjectManifest,
  Root,
} from "@/types";
import type {
  AgentContextCompanionActions,
  AgentContextCompanionSnapshot,
} from "@/lib/agent-context-companion";
import type { ParsedAgentToolBatch } from "../../lib/legacy-agent/tools";

export type ApplyBatchOutcome = "none" | "partial" | "complete";

export type ReadAloudControls = {
  toggleReadAloud: (messageId: string, rawContent: string) => Promise<void>;
  stop: () => void;
  copyPlainText: (rawContent: string) => Promise<void>;
  playingMessageId: string | null;
  loadingMessageId: string | null;
};

export type ProposalDiffSessionActions = {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  regenerateLabel?: string;
  onRegenerate?: () => void;
  fixFailedEditLabel?: string;
  onFixFailedEdit?: () => void;
  primaryDisabled?: boolean;
};

export interface ChatThreadProps {
  /** App storage project id (for plan interaction persistence). */
  projectId?: string | null;
  project: GrokProjectManifest;
  activeRoot: Root | null;
  activeFilePath?: string | null;
  openTabs?: Array<{ path: string; dirty: boolean }>;
  attachments?: AgentChatAttachment[];
  pinnedContext?: AgentContextPin[];
  onRemovePinned?: (pin: AgentContextPin) => void;
  editorSelection?: AgentChatEditorSelection | null;
  onRemoveAttachment?: (attachment: AgentChatAttachment) => void;
  onClearAttachments?: () => void;
  /** Staged uploads merged into `attachments` in the shell. */
  onAddChatAttachments?: (items: AgentChatAttachment[]) => void;
  /** After agent writes or undo, pass absolute paths so the editor can reload from disk. */
  onAgentDiskFilesChanged?: (paths: string[]) => void;
  /** Open a workspace file in the editor tab strip. */
  onOpenFileInEditor?: (path: string) => void;
  /** Open a read-only diff review in the editor column. */
  onOpenDiffSession?: (
    session: DiffSession,
    actions?: ProposalDiffSessionActions | null,
  ) => void;
  onCloseDiffSession?: () => void;
  /** Refresh diff header actions when apply failure is recorded during review. */
  onUpdateDiffSessionActions?: (actions: ProposalDiffSessionActions) => void;
  /** Registers a callback to clear the pending agent proposal when the diff UI closes. */
  onRegisterClearPendingAgentProposal?: (clear: (() => void) | null) => void;
  /** Filled with a bounded recent-thread summary for voice session hydration. */
  voiceThreadSummaryRef?: MutableRefObject<string>;
  /** Registers an async handoff runner (voice -> agent chat). */
  onRegisterVoiceHandoff?: (execute: (() => Promise<void>) | null) => void;
  /** Stops the voice session before starting agent chat (from App / useVoiceSession). */
  onStopVoiceForHandoff?: () => Promise<void>;
  /**
   * When the editor column is collapsed, a context bubble sits top-right over this panel.
   * Reserve horizontal space so messages and composer do not run underneath it.
   */
  reserveContextBubbleInset?: boolean;
  /** Editor column collapsed; controls follow-agent auto-open. */
  editorPaneCollapsed?: boolean;
  onCompanionSnapshotChange?: (snapshot: AgentContextCompanionSnapshot) => void;
  onRegisterContextCompanionActions?: (
    actions: AgentContextCompanionActions | null,
  ) => void;
}

export type PendingEditProposal = {
  batch: ParsedAgentToolBatch;
  rejected: AgentEditProposalRejectedFile[];
  review?: AgentProposalReview;
  source: "tool";
  uiPhase: "pending" | "applied";
  /** Normalized path -> disk content before last successful apply (for post-apply diff). */
  preApplySnapshots?: Record<string, string | null>;
};
