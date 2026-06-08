import { FileText, Folder, Image as ImageIcon, Paperclip, Pin, TextCursorInput, X } from "lucide-react";
import type {
  AgentChatAttachment,
  AgentChatEditorSelection,
  AgentContextPin,
} from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function compactPathLabel(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

type ChatContextChipsProps = {
  pinnedContext: AgentContextPin[];
  attachments: AgentChatAttachment[];
  editorSelection: AgentChatEditorSelection | null;
  selectionKey: string | null;
  onRemovePinned?: (pin: AgentContextPin) => void;
  onRemoveAttachment?: (attachment: AgentChatAttachment) => void;
  onDismissSelection: (selectionKey: string) => void;
};

export function ChatContextChips({
  pinnedContext,
  attachments,
  editorSelection,
  selectionKey,
  onRemovePinned,
  onRemoveAttachment,
  onDismissSelection,
}: ChatContextChipsProps) {
  if (
    pinnedContext.length === 0 &&
    attachments.length === 0 &&
    !editorSelection
  ) {
    return null;
  }

  return (
    <div className="mb-3 flex min-w-0 flex-wrap gap-2">
      {pinnedContext.map((pin) => {
        const chipLabel = compactPathLabel(pin.path);
        return (
          <Tooltip key={`pin:${pin.type}:${pin.path}`}>
            <TooltipTrigger asChild>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gf-accent/40 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                <Pin size={13} className="shrink-0 text-gf-accent" aria-hidden />
                <span className="text-[10px] font-medium uppercase tracking-wide text-gf-accent/90">
                  Pinned
                </span>
                <span className="max-w-48 truncate font-mono text-[11px]">
                  {chipLabel}
                </span>
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label={`Unpin ${pin.type}`}
                  onClick={() => onRemovePinned?.(pin)}
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-sm break-all font-mono text-[11px]"
            >
              {pin.path}
              {"\n"}(persists for this project)
            </TooltipContent>
          </Tooltip>
        );
      })}
      {attachments.map((attachment) => {
        const chipLabel =
          attachment.displayName?.trim() || compactPathLabel(attachment.path);
        const isUploadImage =
          attachment.source === "upload" &&
          (attachment.mediaType?.startsWith("image/") ??
            /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(attachment.path));
        return (
          <Tooltip key={`${attachment.type}:${attachment.path}`}>
            <TooltipTrigger asChild>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                {attachment.type === "folder" ? (
                  <Folder size={13} className="shrink-0 text-zinc-500" aria-hidden />
                ) : attachment.source === "upload" && isUploadImage ? (
                  <ImageIcon size={13} className="shrink-0 text-gf-accent" aria-hidden />
                ) : attachment.source === "upload" ? (
                  <Paperclip size={13} className="shrink-0 text-gf-accent" aria-hidden />
                ) : (
                  <FileText size={13} className="shrink-0 text-zinc-500" aria-hidden />
                )}
                <span className="max-w-48 truncate font-mono text-[11px]">
                  {chipLabel}
                </span>
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label={`Remove ${attachment.type} attachment`}
                  onClick={() => onRemoveAttachment?.(attachment)}
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-sm break-all font-mono text-[11px]"
            >
              {attachment.path}
              {attachment.source === "upload" ? "\n(upload staging)" : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {editorSelection ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
              <TextCursorInput
                size={13}
                className="shrink-0 text-gf-accent"
                aria-hidden
              />
              <span className="max-w-48 truncate font-mono text-[11px]">
                {compactPathLabel(editorSelection.path)}:
                {editorSelection.startLine}
                {editorSelection.endLine !== editorSelection.startLine
                  ? `-${editorSelection.endLine}`
                  : ""}
              </span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Remove editor selection context"
                onClick={() => selectionKey && onDismissSelection(selectionKey)}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-sm break-all font-mono text-[11px]"
          >
            {editorSelection.path}:{editorSelection.startLine}-
            {editorSelection.endLine}
            {editorSelection.truncated ? " (truncated)" : ""}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
