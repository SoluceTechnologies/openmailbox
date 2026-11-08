import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ImageOff, Info, Palette, Plus, TriangleAlert } from 'lucide-react-native';

import { useAccounts } from '@/core/hooks';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { accountColor } from '@/theme';
import { Avatar, FormSection, ListRow, Toggle } from '@/ui/components';
import { LANGUAGES } from '@/utils/i18n';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const authRequired = useSyncStore((state) => state.authRequired);
  const loadRemoteImages = useSettingsStore((state) => state.loadRemoteImages);
  const setLoadRemoteImages = useSettingsStore((state) => state.setLoadRemoteImages);
  const language = useSettingsStore((state) => state.language);

  return (
    <SettingsPage title={t('settings.title')}>
      <FormSection title={t('settings.accounts')}>
        {accounts.map((account) => (
          <ListRow
            key={account.id}
            title={account.displayName}
            subtitle={account.displayName === account.email ? undefined : account.email}
            leading={<Avatar name={account.displayName} size={34} color={accountColor(account.color)} />}
            trailing={authRequired[account.id] ? <TriangleAlert size={18} color={colors.warning} /> : undefined}
            onPress={() => router.push(`/settings/account/${account.id}`)}
          />
        ))}
        <ListRow title={t('accounts.add')} leading={<Plus size={22} color={colors.primary} />} onPress={() => router.push('/accounts/add')} />
      </FormSection>

      <FormSection title={t('settings.reading')} footer={t('settings.loadRemoteImagesHint')}>
        <ListRow
          title={t('settings.loadRemoteImages')}
          leading={<ImageOff size={22} color={colors.primary} />}
          trailing={<Toggle value={loadRemoteImages} onValueChange={setLoadRemoteImages} accessibilityLabel={t('settings.loadRemoteImages')} />}
        />
      </FormSection>

      <FormSection title={t('settings.general')}>
        <ListRow
          title={t('settings.appearance')}
          detail={LANGUAGES.find((option) => option.code === language)?.label}
          leading={<Palette size={22} color={colors.primary} />}
          onPress={() => router.push('/settings/appearance')}
        />
        <ListRow title={t('settings.about')} leading={<Info size={22} color={colors.primary} />} onPress={() => router.push('/settings/about')} />
      </FormSection>
    </SettingsPage>
  );
}
