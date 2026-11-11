import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import { SegmentedControl } from '@/ui/components';
import type { SegmentedOption } from '@/ui/components/SegmentedControl';
import { NATIVE_CHROME } from '@/ui/nativeChrome';

/** The height iOS gives a segmented control. */
const NATIVE_HEIGHT = 32;

interface SegmentedPickerProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

export function SegmentedPicker<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedPickerProps<T>) {
  if (!NATIVE_CHROME) {
    return <SegmentedControl options={options} value={value} onChange={onChange} accessibilityLabel={accessibilityLabel} />;
  }
  return (
    // A fixed height: a Host sized from its content gets its height a frame late, and the list
    // under it jumps when it does.
    <Host style={{ width: '100%', height: NATIVE_HEIGHT }}>
      <Picker selection={value} onSelectionChange={(selection) => onChange(selection as T)} modifiers={[pickerStyle('segmented')]}>
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
