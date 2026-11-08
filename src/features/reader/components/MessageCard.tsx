import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react-native';
import type { EmailSummary } from '@openmailbox/mail-core';

import { avatarColor } from '@/theme';
import { Avatar, Typography } from '@/ui/components';
import { displayName, formatAddressList } from '@/utils/addresses';
import { formatFullDate, formatListDate } from '@/utils/dates';

import { MessageBody } from './MessageBody';

interface MessageCardProps {
  email: EmailSummary;
  expanded: boolean;
  onToggle: (emailId: string) => void;
}

function MessageCardImpl({ email, expanded, onToggle }: MessageCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sender = email.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');
  const recipients = formatAddressList([...email.to, ...email.cc]);

  return (
    <View style={styles.message}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? t('reader.collapseHint') : t('reader.expandHint')}
        onPress={() => onToggle(email.id)}
        style={styles.header}
      >
        <Avatar name={senderName} size={38} color={avatarColor(sender?.email ?? senderName)} />
        <View style={styles.headerText}>
          <View style={styles.line}>
            <Typography numberOfLines={1} style={[styles.sender, { color: colors.text, fontWeight: email.isSeen ? '600' : '700' }]}>
              {senderName}
            </Typography>
            {email.isFlagged ? <Flag size={13} color={colors.warning} fill={colors.warning} /> : null}
            <Typography style={[styles.date, { color: colors.textSecondary }]}>
              {expanded ? formatFullDate(email.receivedAt) : formatListDate(email.receivedAt)}
            </Typography>
          </View>
          <Typography numberOfLines={expanded ? 3 : 1} style={[styles.secondary, { color: colors.textSecondary }]}>
            {expanded ? t('reader.toRecipients', { recipients }) : (email.preview ?? '')}
          </Typography>
        </View>
      </Pressable>
      {expanded ? <MessageBody emailId={email.id} /> : null}
    </View>
  );
}

export const MessageCard = memo(MessageCardImpl);

const styles = StyleSheet.create({
  message: { paddingVertical: 14, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  headerText: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sender: { flex: 1, fontSize: 16, lineHeight: 21 },
  date: { fontSize: 13, fontWeight: '400' },
  secondary: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
});
