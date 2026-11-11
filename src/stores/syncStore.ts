import { create } from 'zustand';
import type { SyncStatus } from '@openmailbox/mail-core';

interface SyncStoreState {
  statuses: Record<string, SyncStatus>;
  authRequired: Record<string, boolean>;
  setStatus: (accountId: string, status: SyncStatus) => void;
  setAuthRequired: (accountId: string, required: boolean) => void;
}

export const useSyncStore = create<SyncStoreState>()((set) => ({
  statuses: {},
  authRequired: {},
  setStatus: (accountId, status) => set((state) => ({ statuses: { ...state.statuses, [accountId]: status } })),
  setAuthRequired: (accountId, required) =>
    set((state) => ({ authRequired: { ...state.authRequired, [accountId]: required } })),
}));
