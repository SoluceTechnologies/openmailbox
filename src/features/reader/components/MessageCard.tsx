import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Flag } from 'lucide-react-native';
import type { EmailSummary } from '@openmailbox/mail-core';

import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { Typography } from '@/ui/components';
import { displayName, type MailAddress } from '@/utils/addresses';
import { formatFullDate, formatListDate } from '@/utils/dates';

import { AddressMenu } from './AddressMenu';
import { MessageBody } from './MessageBody';

interface MessageCardProps {
  email: EmailSummary;
  expanded: boolean;
  onToggle: (emailId: string) => void;
}

function AddressLine({ label, addresses }: { label: string; addresses: MailAddress[] }) {
  const { colors } = useTheme();
  if (addresses.length === 0) return null;
  return (
    <View style={styles.addressLine}>
      <Typography style={[styles.label, { color: colors.text }]}>{label}</Typography>
      {addresses.map((address) => (
        <AddressMenu key={address.email} address={address} />
      ))}
    </View>
  );
}

function MessageCardImpl({ email, expanded, onToggle }: MessageCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [details, setDetails] = useState(false);
  const sender = email.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');
  const recipientNames = [...email.to, ...email.cc].map(displayName).join(', ');
  const showDetails = expanded && details;

  return (
    <View style={styles.message}>
      {showDetails ? (
        // Not inside a Pressable: each name is a native menu, which a parent press would close.
        <View style={styles.header}>
          <ContactAvatar email={sender?.email} name={senderName} size={44} />
          <View style={styles.headerText}>
            <AddressLine label={t('compose.headerFrom')} addresses={email.from} />
            <AddressLine label={t('compose.headerTo')} addresses={email.to} />
            <AddressLine label={t('compose.cc')} addresses={email.cc} />
            <Pressable accessibilityRole="button" onPress={() => setDetails(false)} hitSlop={8}>
              <Typography style={[styles.secondary, { color: colors.textSecondary }]}>{formatFullDate(email.receivedAt)}</Typography>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={expanded ? undefined : t('reader.expandHint')}
          onPress={() => (expanded ? setDetails(true) : onToggle(email.id))}
          style={styles.header}
        >
          <ContactAvatar email={sender?.email} name={senderName} size={44} />
          <View style={styles.headerText}>
            <View style={styles.line}>
              <Typography numberOfLines={1} style={[styles.sender, { color: colors.text, fontWeight: email.isSeen ? '600' : '700' }]}>
                {senderName}
              </Typography>
              {email.isFlagged ? <Flag size={13} color={colors.warning} fill={colors.warning} /> : null}
              <Typography style={[styles.secondary, { color: colors.textSecondary }]}>{formatListDate(email.receivedAt)}</Typography>
            </View>
            {expanded ? (
              <View style={styles.line}>
                <Typography numberOfLines={1} style={[styles.secondary, styles.shrink, { color: colors.textSecondary }]}>
                  {t('reader.toRecipients', { recipients: recipientNames })}
                </Typography>
                <ChevronRight size={14} color={colors.textTertiary} />
              </View>
            ) : (
              <Typography numberOfLines={1} style={[styles.secondary, { color: colors.textSecondary }]}>
                {email.preview ?? ''}
              </Typography>
            )}
          </View>
        </Pressable>
      )}
      {expanded ? (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      ) : null}
      {expanded ? <MessageBody emailId={email.id} /> : null}
    </View>
  );
}

export const MessageCard = memo(MessageCardImpl);

const styles = StyleSheet.create({
  message: { paddingVertical: 14, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16 },
  headerText: { flex: 1, gap: 3, minHeight: 44, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
  label: { fontSize: 15, lineHeight: 22 },
  sender: { flex: 1, fontSize: 17, lineHeight: 22 },
  shrink: { flexShrink: 1 },
  secondary: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});
