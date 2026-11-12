import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AtSign, Bell, BookOpen, Info, Palette, TriangleAlert } from 'lucide-react-native';

import { useAccounts } from '@/core/hooks';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { FormSection, ListRow } from '@/ui/components';
import { LANGUAGES } from '@/utils/i18n';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const authRequired = useSyncStore((state) => accounts.some((account) => state.authRequired[account.id]));
  const language = useSettingsStore((state) => state.language);

  return (
    <SettingsPage title={t('settings.title')}>
      <FormSection>
        <ListRow
          title={t('settings.accounts')}
          detail={accounts.length}
          leading={<AtSign size={22} color={colors.primary} />}
          trailing={authRequired ? <TriangleAlert size={18} color={colors.warning} /> : undefined}
          onPress={() => router.push('/settings/accounts')}
        />
        <ListRow
          title={t('settings.notifications')}
          leading={<Bell size={22} color={colors.primary} />}
          onPress={() => router.push('/settings/notifications')}
        />
        <ListRow title={t('settings.reading')} leading={<BookOpen size={22} color={colors.primary} />} onPress={() => router.push('/settings/reading')} />
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
