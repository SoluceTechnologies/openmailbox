import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react-native';
import { Security, type ServerEndpoint } from '@openmailbox/mail-core';

import { useAccounts } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { deleteSecret, saveSecret } from '@/core/secrets';
import { describeCoreError } from '@/features/accounts/coreErrors';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSyncFailureMessage, useSyncLabel } from '@/features/sync/useSyncLabel';
import { useSyncStore } from '@/stores/syncStore';
import { Button, FormField, FormSection, ListRow, Typography } from '@/ui/components';

function describeEndpoint(endpoint: ServerEndpoint): string {
  return `${endpoint.host}:${endpoint.port} · ${endpoint.security === Security.Tls ? 'SSL/TLS' : 'STARTTLS'}`;
}

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const account = useAccounts().find((candidate) => candidate.id === id);
  const authRequired = useSyncStore((state) => state.authRequired[id] === true);
  const syncLabel = useSyncLabel([id]);
  const syncFailure = useSyncFailureMessage(id);
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; failed: boolean } | null>(null);

  if (!account) return <SettingsPage title="">{null}</SettingsPage>;

  const saveName = () => {
    const trimmed = displayName.trim();
    if (trimmed && trimmed !== account.displayName) mailCore().renameAccount(account.id, trimmed).catch(() => undefined);
  };

  const updatePassword = async () => {
    setUpdating(true);
    setPasswordMessage(null);
    try {
      await mailCore().updatePassword(account.id, password);
      await saveSecret(account.id, password);
      useSyncStore.getState().setAuthRequired(account.id, false);
      setPassword('');
      setPasswordMessage({ text: t('accounts.passwordUpdated'), failed: false });
    } catch (error) {
      setPasswordMessage({ text: describeCoreError(error, t), failed: true });
    } finally {
      setUpdating(false);
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
      <FormSection footer={syncFailure ? `${syncLabel} · ${syncFailure}` : (syncLabel ?? undefined)}>
        <FormField
          label={t('accounts.setup.name')}
          value={displayName}
          onChangeText={setDisplayName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          returnKeyType="done"
        />
        <FormField
          label={t('accounts.setup.email')}
          value={account.email}
          editable={false}
          style={{ color: colors.textSecondary }}
        />
        <ListRow
          title={t('accounts.syncNow')}
          leading={<RefreshCw size={20} color={colors.primary} />}
          chevron={false}
          onPress={() => mailCore().syncNow(account.id)}
        />
      </FormSection>

      <FormSection title={t('accounts.servers')}>
        <ListRow title={t('accounts.setup.incoming')} subtitle={describeEndpoint(account.imap)} />
        <ListRow title={t('accounts.setup.outgoing')} subtitle={describeEndpoint(account.smtp)} />
        <ListRow title={t('accounts.setup.username')} subtitle={account.username} />
      </FormSection>

      <View style={styles.group}>
        <FormSection
          title={t('accounts.password')}
          footer={authRequired ? t('accounts.reconnectRequired') : t('accounts.passwordHint')}
        >
          <FormField
            label={t('accounts.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />
        </FormSection>
        {passwordMessage ? (
          <Typography variant="caption" color={passwordMessage.failed ? colors.danger : colors.textSecondary} style={styles.message}>
            {passwordMessage.text}
          </Typography>
        ) : null}
        <Button title={t('accounts.updatePassword')} loading={updating} disabled={!password || updating} onPress={updatePassword} />
      </View>

      <FormSection>
        <ListRow title={t('accounts.remove')} destructive chevron={false} onPress={remove} />
      </FormSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  message: { marginHorizontal: 16 },
});
