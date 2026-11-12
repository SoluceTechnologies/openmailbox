import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleUserRound, ImageOff } from 'lucide-react-native';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { FormSection, ListRow, Toggle } from '@/ui/components';

export default function ReadingSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const loadRemoteImages = useSettingsStore((state) => state.loadRemoteImages);
  const setLoadRemoteImages = useSettingsStore((state) => state.setLoadRemoteImages);
  const contactPictures = useSettingsStore((state) => state.contactPictures);
  const setContactPictures = useSettingsStore((state) => state.setContactPictures);

  return (
    <SettingsPage title={t('settings.reading')}>
      <FormSection footer={t('settings.loadRemoteImagesHint')}>
        <ListRow
          title={t('settings.loadRemoteImages')}
          leading={<ImageOff size={22} color={colors.primary} />}
          trailing={<Toggle value={loadRemoteImages} onValueChange={setLoadRemoteImages} accessibilityLabel={t('settings.loadRemoteImages')} />}
        />
      </FormSection>

      <FormSection footer={t('settings.contactPicturesHint')}>
        <ListRow
          title={t('settings.contactPictures')}
          leading={<CircleUserRound size={22} color={colors.primary} />}
          trailing={<Toggle value={contactPictures} onValueChange={setContactPictures} accessibilityLabel={t('settings.contactPictures')} />}
        />
      </FormSection>
    </SettingsPage>
  );
}
