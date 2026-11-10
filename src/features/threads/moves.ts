import { Alert } from 'react-native';
import { Destination } from '@openmailbox/mail-core';

import type { ThreadReference } from '@/core/actions';
import { mailCore } from '@/core/mailCore';
import { UNDO_VISIBLE_MS, useUndoStore } from '@/stores/undoStore';
import { haptic } from '@/utils/haptics';
import i18n from '@/utils/i18n';

export const UNDO_HOLD_MS = UNDO_VISIBLE_MS;

export async function moveWithUndo(threads: ThreadReference[], destination: Destination, label: string): Promise<void> {
  haptic();
  const results = await Promise.allSettled(
    threads.map(async (thread) => ({
      relocation: await mailCore().moveThread(thread.mailboxId, thread.threadId, destination, UNDO_HOLD_MS),
      sourceMailboxId: thread.mailboxId,
    })),
  );
  const moves = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const undoable = moves.filter(({ relocation }) => relocation.targetMailboxId && relocation.emailIds.length > 0);
  if (undoable.length > 0) useUndoStore.getState().show({ label, moves: undoable });
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

export function deleteThreadsForever(threads: ThreadReference[]): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(i18n.t('threads.deleteForeverTitle'), i18n.t('threads.deleteForeverMessage'), [
      { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      {
        text: i18n.t('threads.deleteForever'),
        style: 'destructive',
        onPress: () => {
          haptic();
          Promise.all(
            threads.map((thread) => mailCore().moveThread(thread.mailboxId, thread.threadId, new Destination.Trash(), 0)),
          )
            .then(() => resolve(true))
            .catch(() => resolve(false));
        },
      },
    ]);
  });
}
