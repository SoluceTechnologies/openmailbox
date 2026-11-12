import { useLayoutEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/utils/haptics';

const HOLD_MS = 250;
const SHIFT_MS = 150;

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const moved = [...items];
  moved.splice(to, 0, ...moved.splice(from, 1));
  return moved;
}

export function dropIndex(heights: number[], from: number, translation: number): number {
  'worklet';
  let index = from;
  let rest = Math.abs(translation);
  const step = translation > 0 ? 1 : -1;
  while (index + step >= 0 && index + step < heights.length && rest > heights[index + step] / 2) {
    rest -= heights[index + step];
    index += step;
  }
  return index;
}

function slotOffset(heights: number[], from: number, to: number): number {
  'worklet';
  let offset = 0;
  for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) {
    if (index !== from) offset += heights[index] ?? 0;
  }
  return to > from ? offset : -offset;
}

interface RowProps {
  index: number;
  active: SharedValue<number>;
  translation: SharedValue<number>;
  heights: SharedValue<number[]>;
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}

function Row({ index, active, translation, heights, onMove, children }: RowProps) {
  const { colors } = useTheme();

  const pan = Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .onStart(() => {
      active.value = index;
      translation.value = 0;
      scheduleOnRN(haptic);
    })
    .onUpdate((event) => {
      translation.value = event.translationY;
    })
    .onEnd(() => {
      const to = dropIndex(heights.value, index, translation.value);
      translation.value = withTiming(slotOffset(heights.value, index, to), { duration: SHIFT_MS }, () => {
        if (to === index) active.value = -1;
        else scheduleOnRN(onMove, index, to);
      });
    });

  const style = useAnimatedStyle(() => {
    if (active.value === -1) return { zIndex: 0, transform: [{ translateY: 0 }] };
    if (active.value === index) return { zIndex: 1, transform: [{ translateY: translation.value }] };
    const to = dropIndex(heights.value, active.value, translation.value);
    const height = heights.value[active.value] ?? 0;
    const shift = active.value < index && index <= to ? -height : to <= index && index < active.value ? height : 0;
    return { zIndex: 0, transform: [{ translateY: withTiming(shift, { duration: SHIFT_MS }) }] };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[{ backgroundColor: colors.item }, style]}
        onLayout={(event) => {
          const next = [...heights.value];
          next[index] = event.nativeEvent.layout.height;
          heights.value = next;
        }}
      >
        {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

interface ReorderableListProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
}

function ReorderableList<T>({ items, keyOf, renderItem, onMove }: ReorderableListProps<T>) {
  const active = useSharedValue(-1);
  const translation = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);
  const order = items.map(keyOf).join('\u0000');

  useLayoutEffect(() => {
    active.value = -1;
    translation.value = 0;
  }, [order, active, translation]);

  return (
    <View>
      {items.map((item, index) => (
        <Row key={keyOf(item)} index={index} active={active} translation={translation} heights={heights} onMove={onMove}>
          {renderItem(item, index)}
        </Row>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});

export default ReorderableList;
