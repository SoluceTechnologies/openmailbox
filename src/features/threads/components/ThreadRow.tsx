import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Flag, Paperclip, Reply } from 'lucide-react-native';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { avatarColor } from '@/theme';
import { Avatar, Typography } from '@/ui/components';
import { displayName } from '@/utils/addresses';
import { formatListDate } from '@/utils/dates';
import { haptic, ImpactFeedbackStyle } from '@/utils/haptics';

interface ThreadRowProps {
  thread: ThreadSummary;
  accountAccent?: string;
  onOpen: (thread: ThreadSummary) => void;
  onLongPress?: (thread: ThreadSummary) => void;
}

function ThreadRowImpl({ thread, accountAccent, onOpen, onLongPress }: ThreadRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sender = thread.latest.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');
  const unread = thread.unreadCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[unread ? t('threads.unread') : null, thread.latest.isAnswered ? t('threads.replied') : null, senderName, thread.latest.subject, formatListDate(thread.lastReceivedAt)].filter(Boolean).join(', ')}
      onPress={() => onOpen(thread)}
      onLongPress={
        onLongPress
          ? () => {
              haptic(ImpactFeedbackStyle.Medium);
              onLongPress(thread);
            }
          : undefined
      }
      delayLongPress={350}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surface : colors.background }]}
    >
      <View style={styles.indicator}>
        {unread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
        {thread.latest.isAnswered ? <Reply size={13} color={colors.textTertiary} style={styles.replied} /> : null}
      </View>
      <Avatar name={senderName} size={40} color={avatarColor(sender?.email ?? senderName)} />
      <View style={[styles.content, { borderBottomColor: colors.border }]}>
        <View style={styles.line}>
          {accountAccent ? <View style={[styles.accountDot, { backgroundColor: accountAccent }]} /> : null}
          <View style={styles.senderLine}>
            <Typography numberOfLines={1} style={[styles.sender, { color: colors.text, fontWeight: unread ? '700' : '600' }]}>
              {senderName}
            </Typography>
            {thread.messageCount > 1 ? (
              <Typography style={[styles.count, { color: colors.textSecondary }]}>{thread.messageCount}</Typography>
            ) : null}
          </View>
          <Typography style={[styles.date, { color: colors.textSecondary }]}>{formatListDate(thread.lastReceivedAt)}</Typography>
          <ChevronRight size={14} color={colors.textTertiary} />
        </View>
        <View style={styles.line}>
          <Typography numberOfLines={1} style={[styles.subject, { color: colors.text, fontWeight: unread ? '600' : '400' }]}>
            {thread.latest.subject || t('reader.noSubject')}
          </Typography>
          {thread.hasAttachment ? <Paperclip size={13} color={colors.textTertiary} /> : null}
          {thread.isFlagged ? <Flag size={13} color={colors.warning} fill={colors.warning} /> : null}
        </View>
        <Typography numberOfLines={2} style={[styles.preview, { color: colors.textSecondary }]}>
          {thread.latest.preview ?? ''}
        </Typography>
      </View>
    </Pressable>
  );
}

export const ThreadRow = memo(ThreadRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12 },
  indicator: { width: 22, alignItems: 'center', paddingTop: 16 },
  unreadDot: { width: 9, height: 9, borderRadius: 4.5 },
  replied: { marginTop: 4 },
  content: { flex: 1, marginLeft: 10, paddingRight: 16, paddingBottom: 12, gap: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accountDot: { width: 7, height: 7, borderRadius: 3.5 },
  senderLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sender: { flexShrink: 1, fontSize: 16, lineHeight: 21 },
  count: { fontSize: 14, fontWeight: '400' },
  date: { fontSize: 14, fontWeight: '400' },
  subject: { flex: 1, fontSize: 15, lineHeight: 20 },
  preview: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
});
