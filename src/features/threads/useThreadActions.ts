import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Destination, type Mailbox, type ThreadSummary } from '@openmailbox/mail-core';

import { setThreadFlagged, setThreadRead } from '@/core/actions';
import { useMailboxes } from '@/core/hooks';
import type { ComposeMode } from '@/features/composer/prefill';
import { mailboxName } from '@/features/mailboxes/mailboxPresentation';

import { deleteThreadsForever, moveWithUndo } from './moves';
import { availableThreadActions, deletesForGood, indexMailboxes, threadActionContext, type ThreadActionId } from './threadActions';

export function useThreadActions(onMove?: (thread: ThreadSummary) => void) {
  const router = useRouter();
  const { t } = useTranslation();
  const mailboxes = useMailboxes();
  const index = useMemo(() => indexMailboxes(mailboxes), [mailboxes]);

  const actionsFor = useCallback(
    (thread: ThreadSummary) => availableThreadActions(threadActionContext(thread, index)),
    [index],
  );

  const run = useCallback(
    (action: ThreadActionId, thread: ThreadSummary) => {
      const compose = (mode: ComposeMode) =>
        router.push({
          pathname: '/compose',
          params: { mode, emailId: thread.latest.id, threadId: thread.threadId, mailboxId: thread.mailboxId },
        });
      const move = (destination: Destination, label: string) => moveWithUndo([thread], destination, label);
      const work: Promise<unknown> | void = (() => {
        switch (action) {
          case 'reply':
          case 'replyAll':
          case 'forward':
            return compose(action);
          case 'flag':
          case 'unflag':
            return setThreadFlagged(thread, action === 'flag');
          case 'markRead':
          case 'markUnread':
            return setThreadRead(thread, action === 'markRead');
          case 'move':
            return onMove?.(thread);
          case 'archive':
            return move(new Destination.Archive(), t('undo.archived'));
          case 'moveToInbox':
          case 'notJunk':
            return move(new Destination.Inbox(), t('undo.movedToInbox'));
          case 'junk':
            return move(new Destination.Junk(), t('undo.movedToJunk'));
          case 'delete':
            return deletesForGood(threadActionContext(thread, index))
              ? deleteThreadsForever([thread])
              : move(new Destination.Trash(), t('undo.trashed'));
        }
      })();
      return Promise.resolve(work).catch(() => undefined);
    },
    [router, t, index, onMove],
  );

  const moveTo = useCallback(
    (thread: ThreadSummary, mailbox: Mailbox) =>
      moveWithUndo(
        [thread],
        new Destination.Mailbox({ mailboxId: mailbox.id }),
        t('undo.moved', { mailbox: mailboxName(mailbox, t) }),
      ).catch(() => undefined),
    [t],
  );

  const confirms = useCallback(
    (action: ThreadActionId, thread: ThreadSummary) => action === 'delete' && deletesForGood(threadActionContext(thread, index)),
    [index],
  );

  return { actionsFor, run, moveTo, confirms };
}
