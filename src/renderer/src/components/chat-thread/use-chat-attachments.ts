import { useCallback } from "react";
import { toast } from "sonner";
import type { AgentChatAttachment } from "@/types";
import { AGENT_CHAT_MAX_ATTACHMENTS } from "@/types";
import {
  CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN,
} from "../../../../shared/chat/attachment-contract";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]);
  }
  return btoa(binary);
}

const MIB = 1024 * 1024;

/** Stages dropped / picked files under app data so the agent can read them. */
export function useChatAttachments({
  projectId,
  attachments,
  onAddChatAttachments,
}: {
  projectId: string | null | undefined;
  attachments: AgentChatAttachment[];
  onAddChatAttachments?: (items: AgentChatAttachment[]) => void;
}) {
  return useCallback(
    async (fileList: FileList | File[]) => {
      const el = window.electron;
      if (!el?.stageChatAttachment) {
        toast.error("Attachments require the GrokForge desktop app.");
        return;
      }
      if (!projectId) {
        toast.error("Open a project before attaching files.");
        return;
      }
      const added: AgentChatAttachment[] = [];
      let pendingBytes = attachments.reduce((sum, a) => sum + (a.byteSize ?? 0), 0);

      for (const file of Array.from(fileList)) {
        if (file.name === "." || file.name === "..") continue;
        if (attachments.length + added.length >= AGENT_CHAT_MAX_ATTACHMENTS) {
          toast.message("Attachment limit reached", {
            description: `At most ${AGENT_CHAT_MAX_ATTACHMENTS} items per message.`,
          });
          break;
        }
        if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
          toast.error(`Too large: ${file.name}`, {
            description: `Max ${Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / MIB)} MiB per file.`,
          });
          continue;
        }
        if (pendingBytes + file.size > CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN) {
          toast.error("Total attachment size limit reached", {
            description: `Max ${Math.round(CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN / MIB)} MiB of files per message.`,
          });
          break;
        }

        const srcPath = typeof file.path === "string" ? file.path.trim() : "";
        let res: Awaited<ReturnType<typeof el.stageChatAttachment>>;
        if (srcPath) {
          res = await el.stageChatAttachment({ kind: "path", projectId, sourcePath: srcPath });
        } else {
          if (file.size > CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING) {
            toast.error(`Cannot attach: ${file.name}`, {
              description: "This file has no desktop path. Pick files from disk, or use a file under 8 MiB.",
            });
            continue;
          }
          res = await el.stageChatAttachment({
            kind: "bytes",
            projectId,
            base64: uint8ToBase64(new Uint8Array(await file.arrayBuffer())),
            originalName: file.name,
            mediaType: file.type || undefined,
          });
        }
        if (!res.ok) {
          toast.error(res.error);
          continue;
        }
        added.push({
          type: "file",
          path: res.path,
          source: "upload",
          displayName: res.displayName,
          mediaType: res.mediaType,
          byteSize: res.byteSize,
        });
        pendingBytes += res.byteSize;
      }

      if (added.length) {
        onAddChatAttachments?.(added);
        toast.success(added.length === 1 ? "Attached 1 file" : `Attached ${added.length} files`);
      }
    },
    [attachments, onAddChatAttachments, projectId],
  );
}
