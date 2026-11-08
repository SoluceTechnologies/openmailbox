import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';
import { Chip, Stack, Typography } from '@/ui/components';
import { LANGUAGES } from '@/utils/i18n';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((state) => state.themePreference);
  const setThemePreference = useSettingsStore((state) => state.setThemePreference);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  return (
    <SettingsPage title={t('settings.appearance')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={styles.card}>
        <Typography>{t('settings.theme')}</Typography>
        <Stack direction="horizontal" gap={8}>
          {THEMES.map((theme) => (
            <Chip key={theme} fullWidth active={themePreference === theme} onPress={() => setThemePreference(theme)}>
              {t(`settings.themes.${theme}`)}
            </Chip>
          ))}
        </Stack>
      </Stack>
      <Stack card gap={12} padding={16} hAlign="stretch" style={styles.card}>
        <Typography>{t('settings.language')}</Typography>
        <Stack direction="horizontal" gap={8}>
          {LANGUAGES.map((option) => (
            <Chip key={option.code} fullWidth active={language === option.code} onPress={() => setLanguage(option.code)}>
              {option.label}
            </Chip>
          ))}
        </Stack>
      </Stack>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
});
