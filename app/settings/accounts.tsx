import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, TriangleAlert } from 'lucide-react-native';

import { useAccounts } from '@/core/hooks';
import { ProviderMark } from '@/features/accounts/components/ProviderMark';
import { providerForAccount, providerName } from '@/features/accounts/providers';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSyncStore } from '@/stores/syncStore';
import { FormSection, ListRow } from '@/ui/components';

export default function AccountsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const authRequired = useSyncStore((state) => state.authRequired);

  return (
    <SettingsPage title={t('settings.accounts')}>
      <FormSection>
        {accounts.map((account) => (
          <ListRow
            key={account.id}
            title={account.displayName}
            subtitle={[providerName(account), account.displayName === account.email ? null : account.email].filter(Boolean).join(' · ')}
            leading={<ProviderMark brand={providerForAccount(account)?.provider.brand} size={34} />}
            trailing={authRequired[account.id] ? <TriangleAlert size={18} color={colors.warning} /> : undefined}
            onPress={() => router.push(`/settings/account/${account.id}`)}
          />
        ))}
        <ListRow title={t('accounts.add')} leading={<Plus size={22} color={colors.primary} />} onPress={() => router.push('/accounts/add')} />
      </FormSection>
    </SettingsPage>
  );
}
