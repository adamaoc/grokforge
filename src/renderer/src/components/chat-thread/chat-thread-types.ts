import type { MutableRefObject } from "react";
import type {
  AgentChatAttachment,
  AgentChatEditorSelection,
  GrokProjectManifest,
} from "@/types";

export type ReadAloudControls = {
  toggleReadAloud: (messageId: string, rawContent: string) => Promise<void>;
  stop: () => void;
  copyPlainText: (rawContent: string) => Promise<void>;
  playingMessageId: string | null;
  loadingMessageId: string | null;
};

export interface ChatThreadProps {
  /** App storage project id (chat persistence, checkpoints). */
  projectId?: string | null;
  project: GrokProjectManifest;
  activeFilePath?: string | null;
  openTabs?: Array<{ path: string; dirty: boolean }>;
  attachments?: AgentChatAttachment[];
  editorSelection?: AgentChatEditorSelection | null;
  onRemoveAttachment?: (attachment: AgentChatAttachment) => void;
  onClearAttachments?: () => void;
  /** Staged uploads merged into `attachments` in the shell. */
  onAddChatAttachments?: (items: AgentChatAttachment[]) => void;
  /** Filled with a bounded recent-thread summary for voice session hydration. */
  voiceThreadSummaryRef?: MutableRefObject<string>;
  /** Registers an async handoff runner (voice -> agent chat). */
  onRegisterVoiceHandoff?: (execute: (() => Promise<void>) | null) => void;
  /** Stops the voice session before starting agent chat. */
  onStopVoiceForHandoff?: () => Promise<void>;
  /** Opens Settings (agent picker, sign-in hints). */
  onOpenSettings?: () => void;
  /** Opens the terminal panel (e.g. to run `grok login`). */
  onOpenTerminal?: () => void;
}
