import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Host, Image } from '@expo/ui/swift-ui';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { haptic } from '@/utils/haptics';

import { INBOX_FILTERS, PRESENTATION, type InboxFilter } from './categories';

/** The header's own margin, which the row lines up with. */
const MARGIN = 20;
const GAP = 8;
/** How much of All Mail shows at the right edge while a category is chosen, as in Mail. */
const PEEK = 14;
const ALL_WIDTH = 56;
/** Wider screens show the whole row rather than stretching it. */
const MAX_ROW = 520;
const ICON_SIZE = 17;
const ICON_BOX = ICON_SIZE + 4;
const PADDING = 18;
const LABEL_GAP = 6;
const COLLAPSED_MIN = 40;
const SPRING = { damping: 18, stiffness: 230, mass: 0.9 };
const FADE = { duration: 200 };

const IDLE = {
  light: { background: '#e9e9eb', icon: '#808082' },
  dark: { background: '#2c2c2e', icon: '#98989d' },
};

function CategoryIcon({ filter, color }: { filter: InboxFilter; color: string }) {
  const { Icon, symbol } = PRESENTATION[filter];
  if (!NATIVE_CHROME) return <Icon size={ICON_SIZE} color={color} fill={color} strokeWidth={1.5} />;
  return (
    // A fixed frame: a Host sized from its content is measured a frame late and shifts the row.
    <Host style={styles.icon}>
      <Image systemName={symbol} size={ICON_SIZE} color={color} />
    </Host>
  );
}

interface IconLayerProps {
  filter: InboxFilter;
  color: string;
  shown: SharedValue<number>;
  /** The white icon of a chosen chip, rather than the grey one. */
  lit: boolean;
  /** Whether this layer shows once the chip has settled. */
  visible: boolean;
}

function IconLayer({ filter, color, shown, lit, visible }: IconLayerProps) {
  const opacity = useAnimatedStyle(() => ({ opacity: lit ? shown.value : 1 - shown.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: visible ? 1 : 0 }, opacity]}>
      <CategoryIcon filter={filter} color={color} />
    </Animated.View>
  );
}

interface CategoryChipProps {
  filter: InboxFilter;
  selected: boolean;
  /** Shares the row with the other categories rather than keeping a fixed width. */
  flexible: boolean;
  /** The width of the chip's name, once measured; until then the chosen chip sizes itself. */
  labelWidth: number | undefined;
  motion: boolean;
  onPress: () => void;
}

function CategoryChip({ filter, selected, flexible, labelWidth, motion, onPress }: CategoryChipProps) {
  const { t } = useTranslation();
  const { dark } = useTheme();
  const idle = IDLE[dark ? 'dark' : 'light'];
  const tint = PRESENTATION[filter].tint[dark ? 'dark' : 'light'];
  const label = t(PRESENTATION[filter].label);
  // The size springs from an icon (0) to the icon and its name (1), a little past it as Mail's does;
  // the colors fade quicker, without the bounce.
  const progress = useSharedValue(selected ? 1 : 0);
  const shown = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    const target = selected ? 1 : 0;
    progress.value = motion ? withSpring(target, SPRING) : target;
    shown.value = motion ? withTiming(target, FADE) : target;
  }, [selected, motion, progress, shown]);

  const measured = labelWidth !== undefined;
  const nameWidth = labelWidth ?? 0;
  const expanded = 2 * PADDING + ICON_BOX + LABEL_GAP + nameWidth;
  // Widths follow the spring on every frame, so the pill keeps its rounded ends while it grows.
  const size = useAnimatedStyle(() => {
    if (!measured) return {};
    return flexible
      ? { minWidth: COLLAPSED_MIN + (expanded - COLLAPSED_MIN) * progress.value }
      : { width: ALL_WIDTH + (expanded - ALL_WIDTH) * progress.value };
  });
  const background = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(shown.value, [0, 1], [idle.background, tint]),
  }));
  const name = useAnimatedStyle(() => {
    if (!measured) return {};
    const open = Math.max(progress.value, 0);
    return { width: nameWidth * open, marginLeft: LABEL_GAP * Math.min(open, 1), opacity: shown.value };
  });
  // Until the names are measured, the chosen chip takes its content's width.
  const sizing = measured || !selected ? (flexible ? styles.shared : styles.fixed) : styles.own;
  // Where the animations come to rest, for the frames before they first run.
  const settledSize = !measured ? null : flexible ? { minWidth: selected ? expanded : COLLAPSED_MIN } : { width: selected ? expanded : ALL_WIDTH };
  const settledName = selected ? { width: nameWidth, marginLeft: LABEL_GAP, opacity: 1 } : { width: 0, marginLeft: 0, opacity: 0 };

  return (
    <Animated.View style={[styles.chip, sizing, settledSize, size]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: selected ? tint : idle.background }, background]} />
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <IconLayer filter={filter} color={idle.icon} shown={shown} lit={false} visible={!selected} />
          <IconLayer filter={filter} color="#ffffff" shown={shown} lit visible={selected} />
        </View>
        {measured || selected ? (
          <Animated.View
            style={[styles.name, measured ? [settledName, name] : styles.nameShown]}
            accessibilityElementsHidden={!selected}
            importantForAccessibility={selected ? 'auto' : 'no-hide-descendants'}
          >
            <Text numberOfLines={1} style={[styles.label, measured && { width: nameWidth }]}>
              {label}
            </Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

interface CategoryBarProps {
  value: InboxFilter;
  onChange: (filter: InboxFilter) => void;
}

/**
 * The inbox categories and All Mail, like Mail's: the chosen one spells its name in its color and
 * the others share the rest of the row as icons. All Mail peeks at the edge while a category is
 * chosen, and the chips spring from one choice to the next.
 */
export function CategoryBar({ value, onChange }: CategoryBarProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const motion = !useSettingsStore((state) => state.reduceMotion);
  const scroll = useRef<ScrollView>(null);
  const [labelWidths, setLabelWidths] = useState<Partial<Record<InboxFilter, number>>>({});
  const allMail = value === 'all';
  // Laid out from the window, not measured: the row is in place from the first frame.
  const rowWidth = Math.min(MAX_ROW, allMail ? width - 2 * MARGIN : width - MARGIN - PEEK + ALL_WIDTH);
  const animatedRowWidth = useSharedValue(rowWidth);
  const measured = INBOX_FILTERS.every((filter) => labelWidths[filter] !== undefined);

  useEffect(() => {
    animatedRowWidth.value = motion ? withSpring(rowWidth, SPRING) : rowWidth;
  }, [rowWidth, motion, animatedRowWidth]);

  useEffect(() => {
    scroll.current?.scrollTo({ x: 0, animated: motion });
  }, [value, motion]);

  const row = useAnimatedStyle(() => ({ width: animatedRowWidth.value }));

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
      accessibilityLabel={t('categories.filter')}
    >
      <Animated.View style={[styles.row, { width: rowWidth }, row]}>
        {INBOX_FILTERS.map((filter) => (
          <CategoryChip
            key={filter}
            filter={filter}
            selected={filter === value}
            flexible={filter !== 'all'}
            labelWidth={measured ? labelWidths[filter] : undefined}
            motion={motion}
            onPress={() => {
              if (filter === value) return;
              haptic();
              onChange(filter);
            }}
          />
        ))}
      </Animated.View>
      {/* The names at their natural width, out of sight, so the chips can grow to them. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {INBOX_FILTERS.map((filter) => (
          <Text
            key={filter}
            numberOfLines={1}
            style={styles.label}
            onLayout={(event) => {
              const natural = Math.ceil(event.nativeEvent.layout.width);
              setLabelWidths((widths) => (widths[filter] === natural ? widths : { ...widths, [filter]: natural }));
            }}
          >
            {t(PRESENTATION[filter].label)}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: MARGIN, paddingVertical: 2 },
  row: { flexDirection: 'row', gap: GAP },
  chip: { height: 34, borderRadius: 17, overflow: 'hidden' },
  // Sizes come from `width` and `minWidth`, never `flexBasis`: Yoga keeps a flex basis it computed
  // once, so a chip going from its content's width to `flexBasis: 0` would keep its old width.
  own: { flexGrow: 0, flexShrink: 1, width: 'auto' },
  shared: { flexGrow: 1, flexShrink: 1, width: 0, minWidth: COLLAPSED_MIN },
  fixed: { flexGrow: 0, flexShrink: 0, width: ALL_WIDTH },
  pressable: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: PADDING },
  pressed: { opacity: 0.7 },
  icon: { width: ICON_BOX, height: ICON_BOX },
  center: { alignItems: 'center', justifyContent: 'center' },
  name: { overflow: 'hidden' },
  nameShown: { marginLeft: LABEL_GAP, flexShrink: 1 },
  label: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
});
