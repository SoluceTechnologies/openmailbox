import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, TriangleAlert } from 'lucide-react-native';

import { useAccounts } from '@/core/hooks';
import { accountName } from '@/features/accounts/accountName';
import { ProviderMark } from '@/features/accounts/components/ProviderMark';
import { providerForAccount, providerName } from '@/features/accounts/providers';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { FormSection, ListRow, ReorderableList, moveItem } from '@/ui/components';

export default function AccountsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const authRequired = useSyncStore((state) => state.authRequired);
  const accountNames = useSettingsStore((state) => state.accountNames);
  const setAccountOrder = useSettingsStore((state) => state.setAccountOrder);

  const move = (from: number, to: number) => setAccountOrder(moveItem(accounts, from, to).map((account) => account.id));

  return (
    <SettingsPage title={t('settings.accounts')}>
      <FormSection footer={accounts.length > 1 ? t('accounts.reorderHint') : undefined}>
        {accounts.length > 0 ? (
          <ReorderableList
            items={accounts}
            keyOf={(account) => account.id}
            onMove={move}
            renderItem={(account, index) => {
              const name = accountName(account, accountNames);
              return (
                <ListRow
                  title={name}
                  subtitle={[providerName(account), name === account.email ? null : account.email].filter(Boolean).join(' · ')}
                  leading={<ProviderMark brand={providerForAccount(account)?.provider.brand} size={34} />}
                  trailing={authRequired[account.id] ? <TriangleAlert size={18} color={colors.warning} /> : undefined}
                  accessibilityActions={[
                    ...(index > 0 ? [{ name: 'moveUp', label: t('accounts.moveUp') }] : []),
                    ...(index < accounts.length - 1 ? [{ name: 'moveDown', label: t('accounts.moveDown') }] : []),
                  ]}
                  onAccessibilityAction={({ nativeEvent }) => move(index, nativeEvent.actionName === 'moveUp' ? index - 1 : index + 1)}
                  onPress={() => router.push(`/settings/account/${account.id}`)}
                />
              );
            }}
          />
        ) : null}
        <ListRow title={t('accounts.add')} leading={<Plus size={22} color={colors.primary} />} onPress={() => router.push('/accounts/add')} />
      </FormSection>
    </SettingsPage>
  );
}
