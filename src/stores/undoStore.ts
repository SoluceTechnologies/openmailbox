import { create } from 'zustand';
import { Destination, type Relocation } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';

export const UNDO_VISIBLE_MS = 5000;

export interface UndoEntry {
  label: string;
  moves: { relocation: Relocation; sourceMailboxId: string }[];
}

interface UndoState {
  entry: UndoEntry | null;
  show: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  dismiss: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useUndoStore = create<UndoState>()((set, get) => ({
  entry: null,
  show: (entry) => {
    clearTimeout(timer);
    set({ entry });
    timer = setTimeout(() => {
      if (get().entry === entry) set({ entry: null });
    }, UNDO_VISIBLE_MS);
  },
  undo: async () => {
    const { entry } = get();
    if (!entry) return;
    clearTimeout(timer);
    set({ entry: null });
    await Promise.all(
      entry.moves.map(({ relocation, sourceMailboxId }) =>
        mailCore().moveEmails(
          relocation.emailIds,
          relocation.targetMailboxId!,
          new Destination.Mailbox({ mailboxId: sourceMailboxId }),
          0,
        ),
      ),
    );
  },
  dismiss: () => {
    clearTimeout(timer);
    set({ entry: null });
  },
}));
