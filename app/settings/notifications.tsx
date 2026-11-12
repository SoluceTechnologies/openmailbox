import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react-native';

import { useAccounts } from '@/core/hooks';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { requestNotificationPermission } from '@/services/notifications';
import { useSettingsStore } from '@/stores/settingsStore';
import { accountColor } from '@/theme';
import { FormSection, ListRow, Toggle } from '@/ui/components';

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);
  const silencedAccountIds = useSettingsStore((state) => state.silencedAccountIds);
  const setNotificationsEnabled = useSettingsStore((state) => state.setNotificationsEnabled);
  const setAccountNotified = useSettingsStore((state) => state.setAccountNotified);

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled && !(await requestNotificationPermission().catch(() => false))) {
      Alert.alert(t('settings.notifications'), t('settings.notificationsDenied'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.openSystemSettings'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setNotificationsEnabled(enabled);
  };

  return (
    <SettingsPage title={t('settings.notifications')}>
      <FormSection footer={t('settings.notificationsHint')}>
        <ListRow
          title={t('settings.notifyNewMail')}
          leading={<Bell size={22} color={colors.primary} />}
          trailing={
            <Toggle
              value={notificationsEnabled}
              onValueChange={(enabled) => void toggleNotifications(enabled)}
              accessibilityLabel={t('settings.notifyNewMail')}
            />
          }
        />
      </FormSection>

      {notificationsEnabled && accounts.length > 1 ? (
        <FormSection title={t('settings.accounts')}>
          {accounts.map((account) => (
            <ListRow
              key={account.id}
              title={account.displayName}
              leading={<View style={[styles.accountDot, { backgroundColor: accountColor(account.color) }]} />}
              trailing={
                <Toggle
                  value={!silencedAccountIds.includes(account.id)}
                  onValueChange={(notified) => setAccountNotified(account.id, notified)}
                  accessibilityLabel={account.displayName}
                />
              }
            />
          ))}
        </FormSection>
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  accountDot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 6 },
});
