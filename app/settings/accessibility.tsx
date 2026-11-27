import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Vibrate } from 'lucide-react-native';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { FormSection, ListRow, Toggle } from '@/ui/components';

export default function AccessibilitySettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const hapticsEnabled = useSettingsStore((state) => state.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((state) => state.setHapticsEnabled);

  return (
    <SettingsPage title={t('settings.accessibility')}>
      <FormSection footer={t('settings.hapticsHint')}>
        <ListRow
          title={t('settings.haptics')}
          leading={<Vibrate size={22} color={colors.primary} />}
          trailing={<Toggle value={hapticsEnabled} onValueChange={setHapticsEnabled} accessibilityLabel={t('settings.haptics')} />}
        />
      </FormSection>
    </SettingsPage>
  );
}
