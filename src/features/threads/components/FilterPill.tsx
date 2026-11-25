import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ListFilter } from 'lucide-react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { Typography } from '@/ui/components';
import { haptic } from '@/utils/haptics';

const TOGGLE_SIZE = 44;
const BARE_TOGGLE_SIZE = 38;
const INSET = 3;
const BORDER_WIDTH = 1.5;
const COLLAPSED_WIDTH = TOGGLE_SIZE + 2 * INSET;
const MAX_WIDTH = 220;
const LABEL_GAP = 10;
const LABEL_END_PADDING = 12;
const SPRING = { damping: 18, stiffness: 230, mass: 0.9 };
const FADE = { duration: 200 };

interface FilterPillProps {
  enabled: boolean;
  summary: string;
  onToggle: () => void;
  onOpen: () => void;
  bare?: boolean;
  width?: number;
  onMeasure?: (width: number) => void;
}

export function FilterPill({ enabled, summary, onToggle, onOpen, bare = false, width, onMeasure }: FilterPillProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const motion = !useSettingsStore((state) => state.reduceMotion);
  const filteredBy = t('threads.filters.filteredBy');
  const toggleSize = bare ? BARE_TOGGLE_SIZE : TOGGLE_SIZE;
  const [labelWidth, setLabelWidth] = useState<number>();
  const progress = useSharedValue(enabled ? 1 : 0);
  const shown = useSharedValue(enabled ? 1 : 0);

  useEffect(() => {
    const target = enabled ? 1 : 0;
    progress.value = motion ? withSpring(target, SPRING) : target;
    shown.value = motion ? withTiming(target, FADE) : target;
  }, [enabled, motion, progress, shown]);

  const measured = !bare && labelWidth !== undefined;
  const summaryWidth = Math.min(labelWidth ?? 0, MAX_WIDTH - COLLAPSED_WIDTH - LABEL_GAP);
  const expanded = COLLAPSED_WIDTH + LABEL_GAP + summaryWidth;
  const size = useAnimatedStyle(() => (measured ? { width: COLLAPSED_WIDTH + (expanded - COLLAPSED_WIDTH) * Math.max(progress.value, 0) } : {}));
  const fill = useAnimatedStyle(() => ({ opacity: shown.value }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - shown.value }));

  const label = (
    <>
      <Typography variant="caption" weight="600" numberOfLines={1}>
        {filteredBy}
      </Typography>
      <View style={styles.criteria}>
        <Typography variant="caption" weight="600" color={colors.primary} numberOfLines={1} style={styles.criteriaText}>
          {summary}
        </Typography>
        <ChevronDown size={14} color={colors.primary} />
      </View>
    </>
  );

  const measure = (
    <View
      style={[styles.summary, styles.measure]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        const natural = Math.ceil(event.nativeEvent.layout.width);
        if (bare) onMeasure?.(Math.min(BARE_TOGGLE_SIZE + LABEL_GAP + natural, MAX_WIDTH));
        else setLabelWidth((current) => (current === natural ? current : natural));
      }}
    >
      {label}
    </View>
  );

  const pill = (
    <Animated.View
      style={[
        styles.pill,
        bare ? { width, height: BARE_TOGGLE_SIZE } : [styles.raised, { backgroundColor: colors.surface, borderColor: colors.border }],
        measured && { width: enabled ? expanded : COLLAPSED_WIDTH },
        size,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('threads.filters.toggle')}
        accessibilityState={{ selected: enabled }}
        onPress={() => {
          haptic();
          onToggle();
        }}
        style={[styles.toggle, { width: toggleSize, height: toggleSize, borderRadius: toggleSize / 2 }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: toggleSize / 2, backgroundColor: colors.primary }, fill]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, idleIcon]}>
          <ListFilter size={bare ? 20 : 22} color={colors.text} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, fill]}>
          <ListFilter size={bare ? 20 : 22} color={colors.background} />
        </Animated.View>
      </Pressable>
      {enabled || measured ? (
        <Animated.View
          pointerEvents={enabled ? 'auto' : 'none'}
          accessibilityElementsHidden={!enabled}
          importantForAccessibility={enabled ? 'auto' : 'no-hide-descendants'}
          style={[measured ? { width: summaryWidth } : styles.shrink, fill]}
        >
          <Pressable accessibilityRole="button" accessibilityLabel={`${filteredBy} ${summary}`} onPress={onOpen} style={styles.summary}>
            {label}
          </Pressable>
        </Animated.View>
      ) : null}
      {bare ? measure : null}
    </Animated.View>
  );

  if (bare) return pill;

  return (
    <>
      {pill}
      {measure}
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 25, gap: LABEL_GAP, maxWidth: MAX_WIDTH },
  raised: { overflow: 'hidden', borderWidth: BORDER_WIDTH, padding: INSET - BORDER_WIDTH },
  toggle: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  shrink: { flexShrink: 1 },
  summary: { paddingRight: LABEL_END_PADDING },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  criteria: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  criteriaText: { flexShrink: 1 },
});
