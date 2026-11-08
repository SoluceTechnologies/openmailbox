import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { FormSection, ListRow } from '@/ui/components';

export default function AboutScreen() {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.about')}>
      <FormSection footer={t('about.description')}>
        <ListRow title={t('about.version')} detail={Constants.expoConfig?.version ?? '—'} />
        <ListRow title={t('about.license')} detail="MPL-2.0" />
      </FormSection>
    </SettingsPage>
  );
}
