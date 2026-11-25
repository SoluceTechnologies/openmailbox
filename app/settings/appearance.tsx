import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LanguageSelect } from '@/features/accounts/components/LanguageSelect';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';
import { FormSection, SegmentedControl } from '@/ui/components';
import type { TimeFormat } from '@/utils/dates';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const TIME_FORMATS: TimeFormat[] = ['system', '12h', '24h'];

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((state) => state.themePreference);
  const setThemePreference = useSettingsStore((state) => state.setThemePreference);
  const timeFormat = useSettingsStore((state) => state.timeFormat);
  const setTimeFormat = useSettingsStore((state) => state.setTimeFormat);

  return (
    <SettingsPage title={t('settings.appearance')}>
      <FormSection title={t('settings.theme')}>
        <View style={styles.control}>
          <SegmentedControl
            accessibilityLabel={t('settings.theme')}
            value={themePreference}
            onChange={setThemePreference}
            options={THEMES.map((theme) => ({ value: theme, label: t(`settings.themes.${theme}`) }))}
          />
        </View>
      </FormSection>
      <FormSection title={t('settings.timeFormat')}>
        <View style={styles.control}>
          <SegmentedControl
            accessibilityLabel={t('settings.timeFormat')}
            value={timeFormat}
            onChange={setTimeFormat}
            options={TIME_FORMATS.map((format) => ({ value: format, label: t(`settings.timeFormats.${format}`) }))}
          />
        </View>
      </FormSection>
      <FormSection footer={t('settings.languageHint')}>
        <LanguageSelect />
      </FormSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  control: { padding: 12 },
});
