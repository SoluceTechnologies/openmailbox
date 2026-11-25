import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { KeyRound, LogIn, Plus, RefreshCw } from 'lucide-react-native';
import { Authentication, CoreError, Security, type ServerEndpoint } from '@openmailbox/mail-core';

import { useAccounts } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { deleteSecret, saveSecret, smtpSecretId } from '@/core/secrets';
import { accountName } from '@/features/accounts/accountName';
import { describeCoreError } from '@/features/accounts/coreErrors';
import { AccountColorRow } from '@/features/accounts/components/AccountColorRow';
import { ProviderMark } from '@/features/accounts/components/ProviderMark';
import { providerForAccount, providerName } from '@/features/accounts/providers';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { SignatureSection } from '@/features/signatures/SignatureSection';
import { useSyncFailureMessage, useSyncLabel } from '@/features/sync/useSyncLabel';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { FormField, FormSection, ListRow, Typography } from '@/ui/components';
import { goBack } from '@/utils/navigation';

const NO_SIGNATURE = { html: '', text: '' };

function describeEndpoint(endpoint: ServerEndpoint): string {
  return `${endpoint.host}:${endpoint.port} · ${endpoint.security === Security.Tls ? 'SSL/TLS' : 'STARTTLS'}`;
}

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const account = useAccounts().find((candidate) => candidate.id === id);
  const authRequired = useSyncStore((state) => state.authRequired[id] === true);
  const syncLabel = useSyncLabel([id]);
  const syncFailure = useSyncFailureMessage(id);
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const signature = useSettingsStore((state) => state.signatures[id]) ?? NO_SIGNATURE;
  const setSignature = useSettingsStore((state) => state.setSignature);
  const identities = useSettingsStore((state) => state.identities[id]) ?? [];
  const accountNames = useSettingsStore((state) => state.accountNames);
  const setAccountName = useSettingsStore((state) => state.setAccountName);
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
      if (password) {
        await mailCore().updatePassword(account.id, password);
        await saveSecret(account.id, password);
        setPassword('');
      }
      if (smtpPassword) {
        await mailCore().updateSmtpPassword(account.id, smtpPassword);
        await saveSecret(smtpSecretId(account.id), smtpPassword);
        setSmtpPassword('');
      }
      useSyncStore.getState().setAuthRequired(account.id, false);
      setPasswordMessage({ text: t('accounts.passwordUpdated'), failed: false });
    } catch (error) {
      setPasswordMessage({ text: describeCoreError(error, t), failed: true });
    } finally {
      setUpdating(false);
    }
  };

  const signInAgain = async () => {
    setUpdating(true);
    setPasswordMessage(null);
    try {
      const request = mailCore().beginAccountSignIn(account.id);
      const answer = await WebBrowser.openAuthSessionAsync(request.url, request.redirectUri);
      if (answer.type !== 'success') return;
      await mailCore().reauthorize(account.id, answer.url);
      useSyncStore.getState().setAuthRequired(account.id, false);
      setPasswordMessage({ text: t('accounts.signedIn'), failed: false });
    } catch (error) {
      if (!CoreError.Cancelled.instanceOf(error)) setPasswordMessage({ text: describeCoreError(error, t), failed: true });
    } finally {
      setUpdating(false);
    }
  };

  const oauth = account.authentication !== Authentication.Password;
  const openServers = oauth
    ? undefined
    : () => router.push({ pathname: '/settings/servers', params: { accountId: account.id } });
  const passwordInactive = (!password && !smtpPassword) || updating;
  const provider = providerName(account);

  const remove = () =>
    Alert.alert(t('accounts.removeTitle'), t('accounts.removeMessage', { email: account.email }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('accounts.remove'),
        style: 'destructive',
        onPress: async () => {
          await mailCore().removeAccount(account.id);
          await deleteSecret(account.id);
          await deleteSecret(smtpSecretId(account.id));
          useSettingsStore.getState().forgetAccount(account.id);
          await queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
          goBack();
        },
      },
    ]);

  return (
    <SettingsPage title={accountName(account, accountNames)}>
      <FormSection footer={t('accounts.namesHint')}>
        <FormField
          label={t('accounts.accountName')}
          value={accountNames[account.id] ?? ''}
          placeholder={account.email}
          onChangeText={(text) => setAccountName(account.id, text)}
          returnKeyType="done"
        />
        <FormField
          label={t('accounts.senderName')}
          value={displayName}
          placeholder={t('accounts.setup.namePlaceholder')}
          onChangeText={setDisplayName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          returnKeyType="done"
        />
      </FormSection>

      <FormSection footer={syncFailure ? `${syncLabel} · ${syncFailure}` : (syncLabel ?? undefined)}>
        <ListRow title={t('accounts.setup.email')} subtitle={account.email} />
        <ListRow
          title={t('accounts.syncNow')}
          leading={<RefreshCw size={20} color={colors.primary} />}
          chevron={false}
          onPress={() => mailCore().syncNow(account.id)}
        />
      </FormSection>

      <FormSection title={t('accounts.servers')}>
        <ListRow
          title={t('accounts.provider')}
          detail={providerName(account)}
          leading={<ProviderMark brand={providerForAccount(account)?.provider.brand} size={28} />}
          chevron={false}
        />
        <ListRow title={t('accounts.setup.incoming')} subtitle={describeEndpoint(account.imap)} onPress={openServers} />
        <ListRow title={t('accounts.setup.outgoing')} subtitle={describeEndpoint(account.smtp)} onPress={openServers} />
        <ListRow title={t('accounts.setup.username')} subtitle={account.username} onPress={openServers} />
        {account.smtpUsername ? (
          <ListRow title={t('accounts.outgoingUsername')} subtitle={account.smtpUsername} onPress={openServers} />
        ) : null}
      </FormSection>

      <SignatureSection value={signature} footer={t('accounts.signatureHint')} onChange={(next) => setSignature(account.id, next)} />

      <FormSection title={t('accounts.identities')} footer={t('accounts.identitiesHint')}>
        {identities.map((identity) => (
          <ListRow
            key={identity.id}
            title={identity.email}
            subtitle={identity.name || undefined}
            onPress={() => router.push({ pathname: '/settings/identity', params: { accountId: account.id, identityId: identity.id } })}
          />
        ))}
        <ListRow
          title={t('accounts.addIdentity')}
          leading={<Plus size={20} color={colors.primary} />}
          chevron={false}
          onPress={() => router.push({ pathname: '/settings/identity', params: { accountId: account.id } })}
        />
      </FormSection>

      <FormSection>
        <AccountColorRow account={account} />
      </FormSection>

      <View style={styles.group}>
        {oauth ? (
          <FormSection
            title={provider}
            footer={authRequired ? t('accounts.signInRequired', { provider }) : t('accounts.oauthHint', { provider })}
          >
            <ListRow
              title={t('accounts.signInAgain')}
              leading={<LogIn size={20} color={colors.primary} />}
              trailing={updating ? <ActivityIndicator testID="sign-in-again-progress" size="small" color={colors.textSecondary} /> : undefined}
              chevron={false}
              disabled={updating}
              onPress={signInAgain}
            />
          </FormSection>
        ) : (
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
        )}
        {!oauth && account.smtpUsername ? (
          <FormSection title={t('accounts.setup.outgoing')} style={styles.outgoing}>
            <FormField
              label={t('accounts.newPassword')}
              accessibilityLabel={t('accounts.outgoingPassword')}
              value={smtpPassword}
              onChangeText={setSmtpPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />
          </FormSection>
        ) : null}
        {oauth ? null : (
          <FormSection>
            <ListRow
              title={t('accounts.updatePassword')}
              leading={<KeyRound size={20} color={passwordInactive ? colors.textTertiary : colors.primary} />}
              trailing={updating ? <ActivityIndicator size="small" color={colors.textSecondary} /> : undefined}
              chevron={false}
              disabled={passwordInactive}
              onPress={updatePassword}
            />
          </FormSection>
        )}
        {passwordMessage ? (
          <Typography variant="caption" color={passwordMessage.failed ? colors.danger : colors.textSecondary} style={styles.message}>
            {passwordMessage.text}
          </Typography>
        ) : null}
      </View>

      <FormSection>
        <ListRow title={t('accounts.remove')} destructive chevron={false} onPress={remove} />
      </FormSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  outgoing: { marginTop: 16 },
  message: { marginHorizontal: 16 },
});
