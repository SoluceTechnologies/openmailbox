import { Check } from 'lucide-react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Address, Category } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';
import { FormSection, ListRow, Sheet } from '@/ui/components';
import { displayName } from '@/utils/addresses';

import { CATEGORIES, PRESENTATION, filterOf } from './categories';

interface CategoryPickerProps {
  sender: Address | undefined;
  current?: Category;
  onClose: () => void;
}

export function CategoryPicker({ sender, current, onClose }: CategoryPickerProps) {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();

  const choose = (category: Category) => {
    onClose();
    if (sender && category !== current) mailCore().setSenderCategory(sender.email, category).catch(() => undefined);
  };

  return (
    <Sheet visible={sender !== undefined} onClose={onClose} title={t('categories.moveSender', { sender: displayName(sender) })}>
      <FormSection>
        {CATEGORIES.map((category) => {
          const { label, Icon, tint } = PRESENTATION[filterOf(category)];
          return (
            <ListRow
              key={category}
              title={t(label)}
              chevron={false}
              leading={<Icon size={22} color={tint[dark ? 'dark' : 'light']} />}
              trailing={category === current ? <Check size={20} color={colors.primary} /> : undefined}
              onPress={() => choose(category)}
            />
          );
        })}
      </FormSection>
    </Sheet>
  );
}
