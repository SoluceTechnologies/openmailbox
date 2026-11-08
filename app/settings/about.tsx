import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Item, List, Typography } from '@/ui/components';

export default function AboutScreen() {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.about')}>
      <View style={styles.section}>
        <List>
          <Item title={t('about.version')} trailing={<Typography color="secondary">{Constants.expoConfig?.version ?? '—'}</Typography>} />
          <Item title={t('about.license')} trailing={<Typography color="secondary">MPL-2.0</Typography>} />
        </List>
        <Typography variant="caption" color="secondary">
          {t('about.description')}
        </Typography>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, gap: 12 },
});
