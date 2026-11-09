import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useUndoStore } from '@/stores/undoStore';
import { Typography } from '@/ui/components';

const ABOVE_BOTTOM_BAR = 76;

export function UndoToast() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const entry = useUndoStore((state) => state.entry);
  const undo = useUndoStore((state) => state.undo);
  if (!entry) return null;

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: insets.bottom + ABOVE_BOTTOM_BAR }]}>
      <View accessibilityLiveRegion="polite" style={styles.toast}>
        <Typography color="#ffffff" weight="500" numberOfLines={1} style={styles.label}>
          {entry.label}
        </Typography>
        <Pressable accessibilityRole="button" accessibilityLabel={t('undo.undo')} hitSlop={8} onPress={() => undo().catch(() => undefined)}>
          <Typography color="#64b5ff" weight="700">
            {t('undo.undo')}
          </Typography>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 48,
    maxWidth: 520,
    width: '100%',
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#1c1c1e',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { flex: 1 },
});
