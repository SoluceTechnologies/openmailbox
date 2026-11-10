import { ScrollView, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LinearGradient } from 'react-native-svg';

import { AttachmentStack } from '@/features/attachments/AttachmentStack';

const rows = (count: number) => Array.from({ length: count }, (_, index) => <Text key={index}>{`file-${index}`}</Text>);
const stack = (count: number) => (
  <AttachmentStack count={count} background="#ffffff">
    {rows(count)}
  </AttachmentStack>
);

describe('AttachmentStack', () => {
  it('scrolls only past three attachments', () => {
    const { rerender } = render(stack(3));
    expect(screen.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(false);
    expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();
    rerender(stack(4));
    expect(screen.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true);
  });

  it('fades the rows cut off at either edge', () => {
    render(stack(5));
    const fades = () => screen.UNSAFE_queryAllByType(LinearGradient).map((gradient) => gradient.props.id);
    expect(fades()).toEqual(['fade-bottom']);
    const scrollTo = (y: number) =>
      fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
        nativeEvent: { contentOffset: { y }, contentSize: { height: 340 }, layoutMeasurement: { height: 227 } },
      });
    scrollTo(50);
    expect(fades()).toEqual(['fade-top', 'fade-bottom']);
    scrollTo(113);
    expect(fades()).toEqual(['fade-top']);
  });
});
