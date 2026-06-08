import { create } from "zustand";

type ChatThreadComposerState = {
  input: string;
  composerDragActive: boolean;
  setInput: (input: string) => void;
  clearInput: () => void;
  setComposerDragActive: (active: boolean) => void;
};

export const useChatThreadComposerStore = create<ChatThreadComposerState>(
  (set) => ({
    input: "",
    composerDragActive: false,
    setInput: (input) => set({ input }),
    clearInput: () => set({ input: "" }),
    setComposerDragActive: (composerDragActive) => set({ composerDragActive }),
  }),
);
