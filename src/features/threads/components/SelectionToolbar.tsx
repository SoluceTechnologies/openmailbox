import { useState } from 'react';
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
import { availableThreadActions, deletesForGood, threadActionContext } from '../threadActions';

interface SelectionToolbarProps {
  threads: ThreadSummary[];
  onDone: () => void;
}

export function SelectionToolbar({ threads, onDone }: SelectionToolbarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const mailboxes = useMailboxes();
  const [marking, setMarking] = useState(false);
  const [moving, setMoving] = useState(false);

  const contexts = threads.map((thread) => threadActionContext(thread, mailboxes));
  const accountIds = new Set(threads.map((thread) => thread.accountId));
  const canArchive = threads.length > 0 && contexts.every((context) => availableThreadActions(context).includes('archive'));
  const finish = (work: Promise<unknown>) => {
    work.catch(() => undefined);
    onDone();
  };
  const each = (action: (thread: ThreadSummary) => Promise<void>) => finish(Promise.all(threads.map(action)));

  const remove = async () => {
    const forGood = threads.filter((_, index) => deletesForGood(contexts[index]));
    const toTrash = threads.filter((_, index) => !deletesForGood(contexts[index]));
    if (forGood.length > 0) await deleteThreadsForever(forGood);
    if (toTrash.length > 0) await moveWithUndo(toTrash, new Destination.Trash(), t('undo.trashed'));
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

  const empty = threads.length === 0;
  return (
    <>
      <View
        style={[
          styles.bar,
          { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        {button(t('threads.mark'), () => setMarking(true), empty)}
        {button(t('threads.move'), () => setMoving(true), empty || accountIds.size > 1)}
        {button(t('threads.archive'), () => finish(moveWithUndo(threads, new Destination.Archive(), t('undo.archived'))), !canArchive)}
        {button(t('threads.delete'), () => finish(remove()), empty, true)}
      </View>
      <Sheet visible={marking} onClose={() => setMarking(false)} title={t('threads.mark')}>
        <ActionList
          actions={[
            { key: 'read', title: t('threads.markRead'), onPress: () => (setMarking(false), each((thread) => setThreadRead(thread, true))) },
            { key: 'unread', title: t('threads.markUnread'), onPress: () => (setMarking(false), each((thread) => setThreadRead(thread, false))) },
            { key: 'flag', title: t('threads.flag'), onPress: () => (setMarking(false), each((thread) => setThreadFlagged(thread, true))) },
            { key: 'unflag', title: t('threads.unflag'), onPress: () => (setMarking(false), each((thread) => setThreadFlagged(thread, false))) },
          ]}
        />
      </Sheet>
      <MailboxPicker
        accountId={threads[0]?.accountId}
        excludeMailboxId={threads[0]?.mailboxId}
        visible={moving}
        onClose={() => setMoving(false)}
        onSelect={(mailbox) =>
          finish(
            moveWithUndo(
              threads,
              new Destination.Mailbox({ mailboxId: mailbox.id }),
              t('undo.moved', { mailbox: mailboxName(mailbox, t) }),
            ),
          )
        }
      />
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
