import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, Languages } from 'lucide-react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { ListRow, Select, type SelectOption } from '@/ui/components';
import { LANGUAGES, type AppLanguage } from '@/utils/i18n';

export function LanguageSelect({ variant = 'row' }: { variant?: 'row' | 'icon' }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const options: SelectOption<AppLanguage>[] = LANGUAGES.map((option) => ({
    value: option.code,
    label: option.label,
    description: option.english === option.label ? undefined : option.english,
  }));
  const current = options.find((option) => option.value === language);

  return (
    <Select<AppLanguage>
      value={language}
      options={options}
      onChange={setLanguage}
      variant={variant}
      glass={variant === 'icon'}
      accessibilityLabel={t('settings.language')}
      icon={(color) => <Languages size={20} color={color} />}
      trigger={
        variant === 'row' ? (
          <ListRow
            title={t('settings.language')}
            detail={current?.label}
            leading={<Languages size={22} color={colors.primary} />}
            trailing={<ChevronsUpDown size={16} color={colors.textTertiary} />}
          />
        ) : undefined
      }
    />
  );
}
