import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { useBody } from '@/core/hooks';
import { avatarColor } from '@/theme';
import { Avatar, Typography } from '@/ui/components';
import { displayName } from '@/utils/addresses';
import { formatFullDate } from '@/utils/dates';

import { THREAD_ACTION_PRESENTATION, type ThreadActionId } from '../threadActions';

const COMPOSE_ACTIONS: ThreadActionId[] = ['reply', 'replyAll', 'forward'];
const PREVIEW_LINES = 12;

interface ThreadPreviewProps {
  thread: ThreadSummary | null;
  actions: ThreadActionId[];
  onAction: (action: ThreadActionId, thread: ThreadSummary) => void;
  onOpen: (thread: ThreadSummary) => void;
  onClose: () => void;
}

/** The latest message of a thread over the dimmed list, with its actions; loading it marks nothing as read. */
export function ThreadPreview({ thread, actions, onAction, onOpen, onClose }: ThreadPreviewProps) {
  return (
    <Modal visible={thread !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {thread ? <PreviewContent thread={thread} actions={actions} onAction={onAction} onOpen={onOpen} onClose={onClose} /> : null}
    </Modal>
  );
}

function PreviewContent({ thread, actions, onAction, onOpen, onClose }: ThreadPreviewProps & { thread: ThreadSummary }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const body = useBody(thread.latest.id);
  const sender = thread.latest.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');
  const text = body.data?.text.trim() || thread.latest.preview || '';
  const choose = (action: ThreadActionId) => {
    onClose();
    onAction(action, thread);
  };
  const listed = actions.filter((action) => !COMPOSE_ACTIONS.includes(action) && action !== 'delete');

  return (
    <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={styles.backdrop}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('reader.expandHint')}
          onPress={() => {
            onClose();
            onOpen(thread);
          }}
          style={[styles.card, { backgroundColor: colors.background }]}
        >
          <View style={styles.header}>
            <Avatar name={senderName} size={40} color={avatarColor(sender?.email ?? senderName)} />
            <View style={styles.headerText}>
              <Typography weight="600" numberOfLines={1}>
                {senderName}
              </Typography>
              <Typography variant="caption" color={colors.textSecondary} weight="400">
                {formatFullDate(thread.latest.receivedAt)}
              </Typography>
            </View>
          </View>
          <Typography variant="title" style={styles.subject}>
            {thread.latest.subject || t('reader.noSubject')}
          </Typography>
          <Typography weight="400" numberOfLines={PREVIEW_LINES} style={styles.body}>
            {text}
          </Typography>
        </Pressable>

        <View style={[styles.menu, { backgroundColor: colors.background }]}>
          <View style={[styles.composeRow, { borderBottomColor: colors.border }]}>
            {COMPOSE_ACTIONS.filter((action) => actions.includes(action)).map((action) => {
              const { label, Icon } = THREAD_ACTION_PRESENTATION[action];
              return (
                <Pressable
                  key={action}
                  accessibilityRole="button"
                  accessibilityLabel={t(label)}
                  onPress={() => choose(action)}
                  style={styles.composeButton}
                >
                  <Icon size={24} color={colors.text} />
                </Pressable>
              );
            })}
          </View>
          {[...listed, ...(actions.includes('delete') ? (['delete'] as const) : [])].map((action, index) => {
            const { label, Icon, destructive } = THREAD_ACTION_PRESENTATION[action];
            const tint = destructive ? colors.danger : colors.text;
            return (
              <Pressable
                key={action}
                accessibilityRole="button"
                accessibilityLabel={t(label)}
                onPress={() => choose(action)}
                style={({ pressed }) => [
                  styles.menuRow,
                  index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                  pressed && { backgroundColor: colors.surface },
                ]}
              >
                <Typography weight="400" color={tint} style={styles.menuLabel}>
                  {t(label)}
                </Typography>
                <Icon size={20} color={tint} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  content: { paddingHorizontal: 16, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { borderRadius: 18, padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  subject: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 15, lineHeight: 21 },
  menu: { borderRadius: 16, overflow: 'hidden', width: '72%', minWidth: 260 },
  composeRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  composeButton: { padding: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16 },
  menuLabel: { flex: 1, fontSize: 16 },
});
