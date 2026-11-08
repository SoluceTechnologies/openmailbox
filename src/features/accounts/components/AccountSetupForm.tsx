import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Security, type Account, type ServerConfig, type ServerEndpoint } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { saveSecret } from '@/core/secrets';
import { Button, Select, TextField, Typography } from '@/ui/components';
import { isEmail } from '@/utils/addresses';

import { describeCoreError } from '../coreErrors';

const APP_PASSWORD_DOMAINS = ['gmail.com', 'googlemail.com', 'icloud.com', 'me.com', 'mac.com', 'yahoo.com', 'yahoo.fr', 'outlook.com', 'hotmail.com', 'hotmail.fr', 'live.com'];

function EndpointFields({
  label,
  endpoint,
  onChange,
}: {
  label: string;
  endpoint: ServerEndpoint;
  onChange: (endpoint: ServerEndpoint) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <Typography variant="body2">{label}</Typography>
      <TextField
        label={t('accounts.setup.host')}
        value={endpoint.host}
        onChangeText={(host) => onChange({ ...endpoint, host: host.trim() })}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('accounts.setup.port')}
            value={String(endpoint.port)}
            onChangeText={(port) => onChange({ ...endpoint, port: Number(port.replace(/\D/g, '')) || 0 })}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.flex}>
          <Typography variant="body2" color="secondary" style={styles.selectLabel}>
            {t('accounts.setup.security')}
          </Typography>
          <Select
            value={endpoint.security}
            onChange={(security) => onChange({ ...endpoint, security })}
            options={[
              { value: Security.Tls, label: 'SSL/TLS' },
              { value: Security.StartTls, label: 'STARTTLS' },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export function AccountSetupForm({ onDone }: { onDone: (account: Account) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [servers, setServers] = useState<ServerConfig | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const needsAppPassword = APP_PASSWORD_DOMAINS.includes(domain);
  const canSubmit = isEmail(email) && password.length > 0 && !busy;

  const updateEmail = (value: string) => {
    setEmail(value.trim());
    setServers(null);
    setShowAdvanced(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const configuration = servers ?? (await mailCore().discover(email));
      setServers(configuration);
      const account = await mailCore().addAccount(
        {
          email,
          displayName: displayName.trim() || email,
          username: configuration.username,
          imap: configuration.imap,
          smtp: configuration.smtp,
        },
        password,
      );
      await saveSecret(account.id, password);
      queryClient.setQueryData(queryKeys.accounts, await mailCore().listAccounts());
      onDone(account);
    } catch (failure) {
      setError(describeCoreError(failure, t));
      setShowAdvanced(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <TextField
        label={t('accounts.setup.email')}
        value={email}
        onChangeText={updateEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label={t('accounts.setup.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
      />
      {needsAppPassword ? (
        <Typography variant="caption" color="secondary">
          {t('accounts.setup.appPasswordHint')}
        </Typography>
      ) : null}
      <TextField
        label={t('accounts.setup.displayName')}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={email}
      />
      {error ? (
        <Typography variant="caption" color="danger">
          {error}
        </Typography>
      ) : null}
      {showAdvanced && servers ? (
        <View style={styles.advanced}>
          <EndpointFields label={t('accounts.setup.incoming')} endpoint={servers.imap} onChange={(imap) => setServers({ ...servers, imap })} />
          <EndpointFields label={t('accounts.setup.outgoing')} endpoint={servers.smtp} onChange={(smtp) => setServers({ ...servers, smtp })} />
          <TextField
            label={t('accounts.setup.username')}
            value={servers.username}
            onChangeText={(username) => setServers({ ...servers, username })}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : null}
      <Button
        title={busy ? t('accounts.setup.connecting') : t('accounts.setup.connect')}
        loading={busy}
        disabled={!canSubmit}
        onPress={submit}
      />
      {!showAdvanced && isEmail(email) ? (
        <Button
          variant="link"
          title={t('accounts.setup.manual')}
          disabled={busy}
          onPress={async () => {
            if (!servers) {
              setBusy(true);
              setServers(await mailCore().discover(email).catch(() => null));
              setBusy(false);
            }
            setShowAdvanced(true);
          }}
        />
      ) : null}
      <Typography variant="caption" color="secondary" align="center">
        {t('accounts.setup.privacy')}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  group: { gap: 10 },
  advanced: { gap: 20 },
  selectLabel: { marginLeft: 2, marginBottom: 6 },
});
