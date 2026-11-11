import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MailMinus } from 'lucide-react-native';
import { UnsubscribeOutcome, type Unsubscribe } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';
import { describeCoreError } from '@/features/accounts/coreErrors';
import { storage } from '@/storage';
import { Typography } from '@/ui/components';

export function UnsubscribeBanner({ emailId, list }: { emailId: string; list: Unsubscribe }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const key = `unsubscribed:${list.mailto ?? list.httpsUrl}`;
  const [unsubscribed, setUnsubscribed] = useState(() => storage.getBoolean(key) ?? false);

  const unsubscribe = async () => {
    try {
      const outcome = await mailCore().unsubscribe(emailId);
      if (UnsubscribeOutcome.OpenInBrowser.instanceOf(outcome)) await Linking.openURL(outcome.inner.url);
      else {
        storage.set(key, true);
        setUnsubscribed(true);
      }
    } catch (error) {
      Alert.alert(t('reader.unsubscribe'), describeCoreError(error, t));
    }
  };

  const confirm = () =>
    Alert.alert(t('reader.unsubscribeTitle'), t('reader.unsubscribeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('reader.unsubscribe'), onPress: () => void unsubscribe() },
    ]);

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface }]}>
      <MailMinus size={18} color={colors.textSecondary} />
      <Typography variant="caption" color="secondary" style={styles.text}>
        {unsubscribed ? t('reader.unsubscribed') : t('reader.mailingList')}
      </Typography>
      {unsubscribed ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={t('reader.unsubscribe')} hitSlop={8} onPress={confirm}>
          <Typography variant="caption" color="primary" weight="600">
            {t('reader.unsubscribe')}
          </Typography>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  text: { flex: 1 },
});
