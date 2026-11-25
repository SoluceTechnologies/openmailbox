import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ActionList, Sheet } from '@/ui/components';

import { LinkPrompt } from './LinkPrompt';

const SIZES = [
  { key: 'small', px: 13, bold: false },
  { key: 'normal', px: 15, bold: false },
  { key: 'large', px: 18, bold: false },
  { key: 'title', px: 22, bold: true },
] as const;
const PALETTES = {
  text: [
    ['black', '#1a1a1a'],
    ['grey', '#6b7280'],
    ['red', '#dc2626'],
    ['orange', '#ea580c'],
    ['yellow', '#ca8a04'],
    ['green', '#16a34a'],
    ['blue', '#2563eb'],
    ['purple', '#7c3aed'],
  ],
  highlight: [
    ['yellow', '#fef08a'],
    ['green', '#bbf7d0'],
    ['blue', '#bfdbfe'],
    ['purple', '#e9d5ff'],
    ['pink', '#fbcfe8'],
    ['orange', '#fed7aa'],
    ['red', '#fecaca'],
    ['grey', '#e5e7eb'],
  ],
} as const;

export type FormatPanel = 'size' | 'text' | 'highlight' | 'link' | null;

interface Props {
  panel: FormatPanel;
  link: string | null;
  accessoryId?: string;
  onClose: () => void;
  onSize: (px: number, bold: boolean) => void;
  onColor: (kind: 'text' | 'highlight', hex: string) => void;
  onSaveLink: (url: string) => void;
  onRemoveLink: () => void;
}

export function FormatSheets({ panel, link, accessoryId, onClose, onSize, onColor, onSaveLink, onRemoveLink }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const after = (action: () => void) => {
    onClose();
    action();
  };
  const kind = panel === 'highlight' ? 'highlight' : 'text';

  return (
    <>
      <Sheet visible={panel === 'size'} onClose={onClose} title={t('signature.textSize')}>
        <ActionList actions={SIZES.map(({ key, px, bold }) => ({ key, title: t(`signature.sizes.${key}`), onPress: () => after(() => onSize(px, bold)) }))} />
      </Sheet>
      <Sheet visible={panel === 'text' || panel === 'highlight'} onClose={onClose} title={kind === 'highlight' ? t('signature.highlight') : t('signature.textColor')}>
        <View style={styles.swatches}>
          {PALETTES[kind].map(([name, color]) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={t(`colors.${name}`)}
              onPress={() => after(() => onColor(kind, color))}
              style={({ pressed }) => [styles.swatch, { backgroundColor: color, borderColor: colors.textTertiary }, pressed ? styles.pressed : null]}
            />
          ))}
        </View>
      </Sheet>
      {panel === 'link' ? <LinkPrompt link={link} accessoryId={accessoryId} onClose={onClose} onSave={onSaveLink} onRemove={onRemoveLink} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  pressed: { opacity: 0.6 },
});
