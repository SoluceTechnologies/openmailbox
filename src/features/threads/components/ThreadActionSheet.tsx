import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { ActionList, Sheet, Typography } from '@/ui/components';
import { displayName } from '@/utils/addresses';

import { THREAD_ACTION_PRESENTATION, type ThreadActionId } from '../threadActions';

const TOP_ACTIONS: ThreadActionId[] = ['reply', 'replyAll', 'forward', 'delete'];
const STATE_ACTIONS: ThreadActionId[] = ['flag', 'unflag', 'markRead', 'markUnread'];

interface ThreadActionSheetProps {
  thread: ThreadSummary | null;
  actions: ThreadActionId[];
  onAction: (action: ThreadActionId, thread: ThreadSummary) => void;
  onClose: () => void;
}

/** The More sheet: compose and delete as large buttons, then flag and read state, then moves. */
export function ThreadActionSheet({ thread, actions, onAction, onClose }: ThreadActionSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sender = thread?.latest.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');
  const choose = (action: ThreadActionId) => {
    onClose();
    if (thread) onAction(action, thread);
  };
  const list = (ids: ThreadActionId[]) =>
    ids
      .filter((action) => actions.includes(action))
      .map((action) => {
        const { label, Icon, destructive } = THREAD_ACTION_PRESENTATION[action];
        return { key: action, title: t(label), icon: <Icon />, destructive, onPress: () => choose(action) };
      });

  return (
    <Sheet visible={thread !== null} onClose={onClose}>
      {thread ? (
        <View style={styles.content}>
          <View style={styles.header}>
            <ContactAvatar email={sender?.email} name={senderName} size={40} />
            <View style={styles.headerText}>
              <Typography weight="600" numberOfLines={1}>
                {senderName}
              </Typography>
              <Typography variant="caption" weight="400" color={colors.textSecondary} numberOfLines={1}>
                {thread.latest.subject || t('reader.noSubject')}
              </Typography>
            </View>
          </View>
          <View style={styles.topActions}>
            {TOP_ACTIONS.filter((action) => actions.includes(action)).map((action) => {
              const { label, Icon, destructive } = THREAD_ACTION_PRESENTATION[action];
              const tint = destructive ? colors.danger : colors.text;
              return (
                <Pressable
                  key={action}
                  accessibilityRole="button"
                  accessibilityLabel={t(label)}
                  onPress={() => choose(action)}
                  style={({ pressed }) => [styles.topAction, { backgroundColor: pressed ? colors.border : colors.surface }]}
                >
                  <Icon size={22} color={tint} />
                  <Typography variant="caption" weight="500" color={tint} numberOfLines={1}>
                    {t(label)}
                  </Typography>
                </Pressable>
              );
            })}
          </View>
          <ActionList actions={list(STATE_ACTIONS)} />
          <ActionList actions={list(['move', 'archive', 'moveToInbox', 'junk', 'notJunk'])} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  topActions: { flexDirection: 'row', gap: 8 },
  topAction: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14 },
});
