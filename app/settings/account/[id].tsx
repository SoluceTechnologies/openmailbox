import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Security } from '@openmailbox/mail-core';

import { useAccounts } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { deleteSecret, saveSecret } from '@/core/secrets';
import { describeCoreError } from '@/features/accounts/coreErrors';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSyncLabel } from '@/features/sync/useSyncLabel';
import { useSyncStore } from '@/stores/syncStore';
import { Button, Item, List, SectionHeader, TextField, Typography } from '@/ui/components';

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const account = useAccounts().find((candidate) => candidate.id === id);
  const authRequired = useSyncStore((state) => state.authRequired[id] === true);
  const syncLabel = useSyncLabel([id]);
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  if (!account) return <SettingsPage title="">{null}</SettingsPage>;

  const security = (value: Security) => (value === Security.Tls ? 'SSL/TLS' : 'STARTTLS');

  const saveName = () => {
    const trimmed = displayName.trim();
    if (trimmed && trimmed !== account.displayName) mailCore().renameAccount(account.id, trimmed).catch(() => undefined);
  };

  const updatePassword = async () => {
    setBusy(true);
    setPasswordMessage(null);
    try {
      await mailCore().updatePassword(account.id, password);
      await saveSecret(account.id, password);
      useSyncStore.getState().setAuthRequired(account.id, false);
      setPassword('');
      setPasswordMessage(t('accounts.passwordUpdated'));
    } catch (error) {
      setPasswordMessage(describeCoreError(error, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(t('accounts.removeTitle'), t('accounts.removeMessage', { email: account.email }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('accounts.remove'),
        style: 'destructive',
        onPress: async () => {
          await mailCore().removeAccount(account.id);
          await deleteSecret(account.id);
          await queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
          router.back();
        },
      },
    ]);

  return (
    <SettingsPage title={account.displayName}>
      <View style={styles.section}>
        <TextField label={t('accounts.setup.displayName')} value={displayName} onChangeText={setDisplayName} onBlur={saveName} returnKeyType="done" onSubmitEditing={saveName} />
        {syncLabel ? (
          <Typography variant="caption" color="secondary">
            {syncLabel}
          </Typography>
        ) : null}
        <Button variant="secondary" title={t('accounts.syncNow')} onPress={() => mailCore().syncNow(account.id)} />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('accounts.servers')} />
        <List>
          <Item title={account.email} description={t('accounts.setup.username') + ' : ' + account.username} />
          <Item title={t('accounts.setup.incoming')} description={`${account.imap.host}:${account.imap.port} · ${security(account.imap.security)}`} />
          <Item title={t('accounts.setup.outgoing')} description={`${account.smtp.host}:${account.smtp.port} · ${security(account.smtp.security)}`} />
        </List>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('accounts.password')} />
        {authRequired ? (
          <Typography variant="caption" color="danger">
            {t('accounts.reconnectRequired')}
          </Typography>
        ) : null}
        <TextField label={t('accounts.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        {passwordMessage ? <Typography variant="caption">{passwordMessage}</Typography> : null}
        <Button title={t('accounts.updatePassword')} loading={busy} disabled={!password || busy} onPress={updatePassword} />
      </View>

      <View style={styles.section}>
        <Button variant="secondary" color="danger" title={t('accounts.remove')} onPress={remove} />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 24, gap: 10 },
});
