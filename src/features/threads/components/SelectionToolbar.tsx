import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Destination, type ThreadSummary } from '@openmailbox/mail-core';

import { setThreadFlagged, setThreadRead } from '@/core/actions';
import { useMailboxes } from '@/core/hooks';
import { MailboxPicker } from '@/features/mailboxes/components/MailboxPicker';
import { mailboxName } from '@/features/mailboxes/mailboxPresentation';
import { ActionList, Sheet, Typography } from '@/ui/components';

import { deleteThreadsForever, moveWithUndo } from '../moves';
import { availableThreadActions, deletesForGood, indexMailboxes, threadActionContext } from '../threadActions';

export type MarkAction = 'markRead' | 'markUnread' | 'flag' | 'unflag';

export interface SelectionActions {
  empty: boolean;
  canMove: boolean;
  canArchive: boolean;
  mark: (action: MarkAction) => void;
  move: () => void;
  archive: () => void;
  remove: () => void;
  picker: ReactElement;
}

export function useSelectionActions(threads: ThreadSummary[], onDone: () => void): SelectionActions {
  const { t } = useTranslation();
  const mailboxes = useMailboxes();
  const [moving, setMoving] = useState(false);

  const index = indexMailboxes(mailboxes);
  const contexts = threads.map((thread) => threadActionContext(thread, index));
  const accountIds = new Set(threads.map((thread) => thread.accountId));
  const empty = threads.length === 0;
  const finish = (work: Promise<unknown>) => {
    work.catch(() => undefined);
    onDone();
  };
  const each = (action: (thread: ThreadSummary) => Promise<void>) => finish(Promise.all(threads.map(action)));

  const remove = async () => {
    const forGood = threads.filter((_, position) => deletesForGood(contexts[position]));
    const toTrash = threads.filter((_, position) => !deletesForGood(contexts[position]));
    if (forGood.length > 0) await deleteThreadsForever(forGood);
    if (toTrash.length > 0) await moveWithUndo(toTrash, new Destination.Trash(), t('undo.trashed'));
  };

  return {
    empty,
    canMove: !empty && accountIds.size === 1,
    canArchive: !empty && contexts.every((context) => availableThreadActions(context).includes('archive')),
    mark: (action) =>
      each((thread) =>
        action === 'markRead' || action === 'markUnread'
          ? setThreadRead(thread, action === 'markRead')
          : setThreadFlagged(thread, action === 'flag'),
      ),
    move: () => setMoving(true),
    archive: () => finish(moveWithUndo(threads, new Destination.Archive(), t('undo.archived'))),
    remove: () => finish(remove()),
    picker: (
      <MailboxPicker
        accountId={threads[0]?.accountId}
        excludeMailboxId={threads[0]?.mailboxId}
        visible={moving}
        onClose={() => setMoving(false)}
        onSelect={(mailbox) =>
          finish(
            moveWithUndo(threads, new Destination.Mailbox({ mailboxId: mailbox.id }), t('undo.moved', { mailbox: mailboxName(mailbox, t) })),
          )
        }
      />
    ),
  };
}

interface SelectionToolbarProps {
  threads: ThreadSummary[];
  onDone: () => void;
}

export function SelectionToolbar({ threads, onDone }: SelectionToolbarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [marking, setMarking] = useState(false);
  const actions = useSelectionActions(threads, onDone);
  const mark = (action: MarkAction) => () => {
    setMarking(false);
    actions.mark(action);
  };

  const button = (label: string, onPress: () => void, disabled = false, destructive = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={styles.button}
    >
      <Typography weight="600" color={disabled ? colors.textTertiary : destructive ? colors.danger : colors.primary}>
        {label}
      </Typography>
    </Pressable>
  );

  return (
    <>
      <View
        style={[
          styles.bar,
          { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        {button(t('threads.mark'), () => setMarking(true), actions.empty)}
        {button(t('threads.move'), actions.move, !actions.canMove)}
        {button(t('threads.archive'), actions.archive, !actions.canArchive)}
        {button(t('threads.delete'), actions.remove, actions.empty, true)}
      </View>
      <Sheet visible={marking} onClose={() => setMarking(false)} title={t('threads.mark')}>
        <ActionList
          actions={[
            { key: 'read', title: t('threads.markRead'), onPress: mark('markRead') },
            { key: 'unread', title: t('threads.markUnread'), onPress: mark('markUnread') },
            { key: 'flag', title: t('threads.flag'), onPress: mark('flag') },
            { key: 'unflag', title: t('threads.unflag'), onPress: mark('unflag') },
          ]}
        />
      </Sheet>
      {actions.picker}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: { paddingVertical: 6 },
});
