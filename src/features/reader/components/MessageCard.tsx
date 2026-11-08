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
  const senderName = displayName(sender) || '—';
  const recipients = [...email.to, ...email.cc];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => onToggle(email.id)} style={styles.header}>
        <Avatar name={senderName} size={40} color={avatarColor(sender?.email ?? senderName)} />
        <View style={styles.headerText}>
          <View style={styles.line}>
            <Typography variant="body2" weight={email.isSeen ? '600' : '700'} numberOfLines={1} style={styles.flex}>
              {senderName}
            </Typography>
            {email.isFlagged ? <Flag size={14} color={colors.warning} fill={colors.warning} /> : null}
            <Typography variant="caption" color="secondary">
              {expanded ? formatFullDate(email.receivedAt) : formatListDate(email.receivedAt)}
            </Typography>
          </View>
          <Typography variant="caption" color="secondary" numberOfLines={expanded ? 3 : 1}>
            {expanded ? `${t('reader.to')} ${formatAddressList(recipients)}` : (email.preview ?? '')}
          </Typography>
        </View>
      </Pressable>
      {expanded ? <MessageBody emailId={email.id} /> : null}
    </View>
  );
}

export const MessageCard = memo(MessageCardImpl);

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 12 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerText: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1 },
});
