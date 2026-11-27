import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { Share, X } from 'lucide-react-native';

import { mailCore } from '@/core/mailCore';
import { queryKeys } from '@/core/queryClient';
import { fileUri, openAttachmentOfFile } from '@/features/attachments/openAttachment';
import { BodyContent } from '@/features/reader/components/MessageBody';
import { AddressLine } from '@/features/reader/components/MessageCard';
import { IconButton, Spinner, Typography, ViewContainer } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { formatFullDate } from '@/utils/dates';
import { goBack } from '@/utils/navigation';

export default function MessageScreen() {
  const { path, name, mimeType } = useLocalSearchParams<{ path: string; name: string; mimeType: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const message = useQuery({
    queryKey: queryKeys.savedMessage(path),
    queryFn: () => mailCore().readMessageFile(path),
    retry: false,
    staleTime: Infinity,
  });
  const share = () => Sharing.shareAsync(fileUri(path), { mimeType, dialogTitle: name }).catch(() => undefined);

  const content = message.data ? (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Typography variant="h4" selectable>
          {message.data.subject || name}
        </Typography>
        <AddressLine label={t('compose.headerFrom')} addresses={message.data.from} />
        <AddressLine label={t('compose.headerTo')} addresses={message.data.to} />
        <AddressLine label={t('compose.cc')} addresses={message.data.cc} />
        {message.data.date != null ? (
          <Typography style={[styles.date, { color: colors.textSecondary }]}>{formatFullDate(Number(message.data.date))}</Typography>
        ) : null}
      </View>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />
      <View style={styles.body}>
        <BodyContent
          html={message.data.body.html}
          text={message.data.body.text}
          hasRemoteContent={message.data.body.hasRemoteContent}
          attachments={message.data.body.attachments}
          onOpen={(attachment) => openAttachmentOfFile(path, attachment)}
        />
      </View>
    </ScrollView>
  ) : message.isError ? (
    <Typography color="secondary" align="center" style={styles.status}>
      {t('reader.loadFailed')}
    </Typography>
  ) : (
    <Spinner style={styles.status} />
  );

  if (NATIVE_CHROME) {
    return (
      <>
        {content}
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="xmark" accessibilityLabel={t('common.close')} onPress={goBack} />
        </Stack.Toolbar>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="square.and.arrow.up" accessibilityLabel={t('reader.share')} onPress={share} />
        </Stack.Toolbar>
      </>
    );
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <IconButton round size={40} accessibilityLabel={t('common.close')} onPress={goBack}>
            <X size={20} color={colors.text} />
          </IconButton>
          <View style={styles.flex} />
          <IconButton round size={40} accessibilityLabel={t('reader.share')} onPress={share}>
            <Share size={20} color={colors.primary} />
          </IconButton>
        </View>
        {content}
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { paddingVertical: 16, gap: 14 },
  header: { gap: 4, paddingHorizontal: 16 },
  date: { fontSize: 15, lineHeight: 20 },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  body: { gap: 12, paddingHorizontal: 16 },
  status: { marginVertical: 24, paddingHorizontal: 16 },
});
