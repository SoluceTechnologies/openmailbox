import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import type { Account, ServerConfig, ServerEndpoint } from '@openmailbox/mail-core';

import { useAccounts } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { deleteSecret, saveSecret, smtpSecretId } from '@/core/secrets';
import { describeCoreError } from '@/features/accounts/coreErrors';
import { EndpointSection } from '@/features/accounts/components/EndpointSection';
import { SignInError } from '@/features/accounts/components/SignInError';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSyncStore } from '@/stores/syncStore';
import { FormField, IconButton } from '@/ui/components';
import { goBack } from '@/utils/navigation';

const sameEndpoint = (left: ServerEndpoint, right: ServerEndpoint) =>
  left.host === right.host && left.port === right.port && left.security === right.security;

export default function ServerSettingsScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const account = useAccounts().find((candidate) => candidate.id === accountId);
  if (!account) return <SettingsPage title="">{null}</SettingsPage>;
  return <ServerSettingsForm account={account} />;
}

function ServerSettingsForm({ account }: { account: Account }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [servers, setServers] = useState<ServerConfig>({
    imap: account.imap,
    smtp: account.smtp,
    username: account.username,
    smtpUsername: account.smtpUsername,
  });
  const [password, setPassword] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authRequired = useSyncStore((state) => state.authRequired[account.id] === true);

  const username = servers.username.trim();
  const smtpUsername = servers.smtpUsername?.trim() || (smtpPassword ? username : undefined);
  const changed =
    !sameEndpoint(servers.imap, account.imap) ||
    !sameEndpoint(servers.smtp, account.smtp) ||
    username !== account.username ||
    smtpUsername !== (account.smtpUsername || undefined) ||
    password !== '' ||
    smtpPassword !== '';
  const valid = !!servers.imap.host && !!servers.smtp.host && servers.imap.port > 0 && servers.smtp.port > 0 && !!username;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await mailCore().updateServers(account.id, { ...servers, username, smtpUsername }, password || undefined, smtpPassword || undefined);
      if (password) await saveSecret(account.id, password);
      if (!smtpUsername) await deleteSecret(smtpSecretId(account.id));
      else if (smtpPassword) await saveSecret(smtpSecretId(account.id), smtpPassword);
      useSyncStore.getState().setAuthRequired(account.id, false);
      goBack();
    } catch (failure) {
      setError(describeCoreError(failure, t));
      setSaving(false);
    }
  };

  return (
    <SettingsPage
      title={t('accounts.serverSettings')}
      right={
        saving ? (
          <View style={styles.progress}>
            <ActivityIndicator accessibilityLabel={t('accounts.setup.connectingTo', { host: servers.imap.host })} color={colors.textSecondary} />
          </View>
        ) : (
          <IconButton round glass size={40} accessibilityLabel={t('accounts.saveServers')} disabled={!changed || !valid} onPress={save}>
            <Check size={20} color={colors.primary} />
          </IconButton>
        )
      }
    >
      {error ? <SignInError message={error} /> : null}
      <EndpointSection
        title={t('accounts.setup.incoming')}
        hostPlaceholder="imap.example.com"
        endpoint={servers.imap}
        onChange={(imap) => setServers({ ...servers, imap })}
        footer={t('accounts.passwordHint')}
      >
        <FormField
          label={t('accounts.setup.username')}
          value={servers.username}
          onChangeText={(next) => setServers({ ...servers, username: next })}
          placeholder={account.email}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FormField
          label={t('accounts.setup.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={authRequired ? t('accounts.setup.required') : t('accounts.unchanged')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />
      </EndpointSection>
      <EndpointSection
        title={t('accounts.setup.outgoing')}
        hostPlaceholder="smtp.example.com"
        endpoint={servers.smtp}
        onChange={(smtp) => setServers({ ...servers, smtp })}
      >
        <FormField
          label={t('accounts.setup.username')}
          accessibilityLabel={t('accounts.outgoingUsername')}
          value={servers.smtpUsername ?? ''}
          onChangeText={(next) => setServers({ ...servers, smtpUsername: next })}
          placeholder={t('accounts.setup.sameAsIncoming')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FormField
          label={t('accounts.setup.password')}
          accessibilityLabel={t('accounts.outgoingPassword')}
          value={smtpPassword}
          onChangeText={setSmtpPassword}
          placeholder={t('accounts.unchanged')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />
      </EndpointSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  progress: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
