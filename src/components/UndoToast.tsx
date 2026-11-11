import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useUndoStore } from '@/stores/undoStore';
import { Typography } from '@/ui/components';

const ABOVE_BOTTOM_BAR = 76;

export function UndoToast() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const entry = useUndoStore((state) => state.entry);
  const undo = useUndoStore((state) => state.undo);
  if (!entry) return null;

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: insets.bottom + ABOVE_BOTTOM_BAR }]}>
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Typography color="text" weight="500" numberOfLines={1} style={styles.label}>
          {entry.label}
        </Typography>
        {entry.moves.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('undo.undo')} hitSlop={10} onPress={() => undo().catch(() => undefined)}>
            <Typography color={colors.primary} weight="600" style={styles.label}>
              {t('undo.undo')}
            </Typography>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    maxWidth: '100%',
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  label: { fontSize: 15, flexShrink: 1 },
});
