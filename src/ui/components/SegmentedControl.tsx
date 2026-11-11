import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

import Typography from './Typography';

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

function SegmentedControl<T extends string | number>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const { colors, dark } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.track, { backgroundColor: dark ? '#2c2c2e' : '#eeeef0' }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && [styles.selected, { backgroundColor: dark ? '#636366' : '#ffffff' }]]}
          >
            <Typography variant="caption" weight={selected ? '600' : '500'} color={colors.text} numberOfLines={1}>
              {option.label}
            </Typography>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 30, paddingHorizontal: 12, borderRadius: 7 },
  selected: { shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});

export default SegmentedControl;
