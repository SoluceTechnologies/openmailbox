import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { Flag, Paperclip } from 'lucide-react-native';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { avatarColor } from '@/theme';
import { Avatar, Typography } from '@/ui/components';
import { displayName } from '@/utils/addresses';
import { formatListDate } from '@/utils/dates';

interface ThreadRowProps {
  thread: ThreadSummary;
  accountAccent?: string;
  onOpen: (thread: ThreadSummary) => void;
}

function ThreadRowImpl({ thread, accountAccent, onOpen }: ThreadRowProps) {
  const { colors } = useTheme();
  const sender = thread.latest.from[0];
  const senderName = displayName(sender) || '—';
  const unread = thread.unreadCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(thread)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surface : colors.background }]}
    >
      <View style={styles.unreadColumn}>{unread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}</View>
      <Avatar name={senderName} size={44} color={avatarColor(sender?.email ?? senderName)} />
      <View style={[styles.content, { borderBottomColor: colors.border }]}>
        <View style={styles.line}>
          <Typography variant="title" weight={unread ? '700' : '600'} numberOfLines={1} style={styles.sender}>
            {senderName}
          </Typography>
          {thread.messageCount > 1 ? (
            <Typography variant="caption" color="secondary">
              {thread.messageCount}
            </Typography>
          ) : null}
          {accountAccent ? <View style={[styles.accountDot, { backgroundColor: accountAccent }]} /> : null}
          <Typography variant="caption" color="secondary">
            {formatListDate(thread.lastReceivedAt)}
          </Typography>
        </View>
        <View style={styles.line}>
          <Typography variant="body2" weight={unread ? '600' : '400'} numberOfLines={1} style={styles.flex}>
            {thread.latest.subject || '—'}
          </Typography>
          {thread.hasAttachment ? <Paperclip size={14} color={colors.textTertiary} /> : null}
          {thread.isFlagged ? <Flag size={14} color={colors.warning} fill={colors.warning} /> : null}
        </View>
        <Typography variant="caption" color="secondary" numberOfLines={2}>
          {thread.latest.preview ?? ''}
        </Typography>
      </View>
    </Pressable>
  );
}

export const ThreadRow = memo(ThreadRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 4, paddingRight: 16, paddingTop: 12 },
  unreadColumn: { width: 20, alignItems: 'center', paddingTop: 18 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
  content: { flex: 1, marginLeft: 12, paddingBottom: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sender: { flex: 1 },
  flex: { flex: 1 },
  accountDot: { width: 8, height: 8, borderRadius: 4 },
});
