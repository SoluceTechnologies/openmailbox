import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bug, Code } from 'lucide-react-native';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { FormSection, ListRow } from '@/ui/components';

const REPOSITORY_URL = 'https://github.com/SoluceTechnologies/openmailbox';

export default function AboutScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  return (
    <SettingsPage title={t('settings.about')}>
      <FormSection footer={t('about.description')}>
        <ListRow title={t('about.version')} detail={Constants.expoConfig?.version ?? '—'} />
        <ListRow title={t('about.license')} detail="MPL-2.0" />
      </FormSection>
      <FormSection>
        <ListRow
          title={t('about.sourceCode')}
          leading={<Code size={22} color={colors.primary} />}
          onPress={() => open(REPOSITORY_URL)}
        />
        <ListRow
          title={t('about.reportBug')}
          leading={<Bug size={22} color={colors.primary} />}
          onPress={() => open(`${REPOSITORY_URL}/issues/new?template=bug_report.md`)}
        />
      </FormSection>
    </SettingsPage>
  );
}
