import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LanguageSelect } from '@/features/accounts/components/LanguageSelect';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';
import { FormSection, SegmentedControl } from '@/ui/components';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((state) => state.themePreference);
  const setThemePreference = useSettingsStore((state) => state.setThemePreference);

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
      <FormSection footer={t('settings.languageHint')}>
        <LanguageSelect />
      </FormSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  control: { padding: 12 },
});
