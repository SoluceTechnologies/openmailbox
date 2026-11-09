import { memo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Sharing from 'expo-sharing';
import { ImageOff, Paperclip } from 'lucide-react-native';
import type { Attachment } from '@openmailbox/mail-core';

import { useBody } from '@/core/hooks';
import { describeCoreError } from '@/features/accounts/coreErrors';
import { attachmentsDirectory, mailCore } from '@/core/mailCore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Spinner, Typography } from '@/ui/components';

import { HtmlBody } from './HtmlBody';
import { UnsubscribeBanner } from './UnsubscribeBanner';

function useFormatSize(): (bytes: number) => string {
  const { t } = useTranslation();
  return (bytes) => {
    if (bytes < 1024) return t('units.bytes', { value: bytes });
    if (bytes < 1024 * 1024) return t('units.kilobytes', { value: Math.round(bytes / 1024) });
    return t('units.megabytes', { value: (bytes / (1024 * 1024)).toFixed(1) });
  };
}

function AttachmentChip({ emailId, attachment }: { emailId: string; attachment: Attachment }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const formatSize = useFormatSize();
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    try {
      const path = await mailCore().saveAttachment(emailId, attachment.index, attachmentsDirectory());
      await Sharing.shareAsync(`file://${path}`, { mimeType: attachment.mimeType, dialogTitle: attachment.filename });
    } catch {
      Alert.alert(t('reader.attachmentFailed'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      disabled={opening}
      style={[styles.attachment, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {opening ? <Spinner size="small" /> : <Paperclip size={16} color={colors.textSecondary} />}
      <View style={styles.attachmentText}>
        <Typography variant="body2" numberOfLines={1}>
          {attachment.filename}
        </Typography>
        <Typography variant="caption" color="secondary">
          {formatSize(attachment.size)}
        </Typography>
      </View>
    </Pressable>
  );
}

function MessageBodyImpl({ emailId }: { emailId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const loadRemoteImagesByDefault = useSettingsStore((state) => state.loadRemoteImages);
  const [remoteAllowed, setRemoteAllowed] = useState(loadRemoteImagesByDefault);
  const body = useBody(emailId);

  if (body.isLoading) return <Spinner style={styles.loading} />;
  if (body.isError || !body.data) {
    return (
      <View style={styles.error}>
        <Typography color="secondary">{t('reader.loadFailed')}</Typography>
        {body.error ? (
          <Typography variant="caption" color="secondary" align="center">
            {describeCoreError(body.error, t)}
          </Typography>
        ) : null}
        <Button variant="link" title={t('common.retry')} onPress={() => body.refetch()} />
      </View>
    );
  }

  const { html, text, hasRemoteContent, attachments, unsubscribe } = body.data;
  return (
    <View style={styles.body}>
      {unsubscribe ? <UnsubscribeBanner emailId={emailId} /> : null}
      {html && hasRemoteContent && !remoteAllowed ? (
        <Pressable onPress={() => setRemoteAllowed(true)} style={[styles.remoteBanner, { backgroundColor: colors.surface }]}>
          <ImageOff size={16} color={colors.textSecondary} />
          <Typography variant="caption" color="secondary" style={styles.flex}>
            {t('reader.remoteContentBlocked')}
          </Typography>
          <Typography variant="caption" color="primary" weight="600">
            {t('reader.loadRemoteContent')}
          </Typography>
        </Pressable>
      ) : null}
      {html ? (
        <HtmlBody html={html} allowRemoteContent={remoteAllowed} />
      ) : (
        <Typography variant="body1" weight="400" selectable style={styles.text}>
          {text}
        </Typography>
      )}
      {attachments.length > 0 ? (
        <View style={styles.attachments}>
          {attachments.map((attachment) => (
            <AttachmentChip key={attachment.index} emailId={emailId} attachment={attachment} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const MessageBody = memo(MessageBodyImpl);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: 12, paddingHorizontal: 16 },
  loading: { marginVertical: 24 },
  error: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, gap: 4 },
  text: { fontSize: 16, lineHeight: 23 },
  remoteBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10 },
  attachments: { gap: 8 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  attachmentText: { flex: 1 },
});
