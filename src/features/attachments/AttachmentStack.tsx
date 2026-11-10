import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const VISIBLE_ROWS = 3;
// ponytail: fixed row estimate (chip padding + name + size); measure rows if chips change height.
const ROW_HEIGHT = 58;
const GAP = 8;
// Half of the next row peeks out, so the list reads as scrollable.
const MAX_HEIGHT = VISIBLE_ROWS * (ROW_HEIGHT + GAP) + ROW_HEIGHT / 2;
const FADE_HEIGHT = 28;

interface AttachmentStackProps {
  count: number;
  background: string;
  children: ReactNode;
}

export function AttachmentStack({ count, background, children }: AttachmentStackProps) {
  const scrolls = count > VISIBLE_ROWS;
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  const onScroll = ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) =>
    setEdges({ atStart: contentOffset.y <= 1, atEnd: contentOffset.y + layoutMeasurement.height >= contentSize.height - 1 });

  return (
    <View>
      <ScrollView
        scrollEnabled={scrolls}
        nestedScrollEnabled
        onScroll={scrolls ? onScroll : undefined}
        scrollEventThrottle={32}
        style={scrolls ? styles.capped : undefined}
        contentContainerStyle={styles.rows}
      >
        {children}
      </ScrollView>
      {scrolls && !edges.atStart ? <Fade color={background} edge="top" /> : null}
      {scrolls && !edges.atEnd ? <Fade color={background} edge="bottom" /> : null}
    </View>
  );
}

function Fade({ color, edge }: { color: string; edge: 'top' | 'bottom' }) {
  const id = `fade-${edge}`;
  return (
    <Svg pointerEvents="none" width="100%" height={FADE_HEIGHT} style={[styles.fade, edge === 'top' ? styles.top : styles.bottom]}>
      <Defs>
        <LinearGradient id={id} x1="0" y1={edge === 'top' ? '1' : '0'} x2="0" y2={edge === 'top' ? '0' : '1'}>
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  capped: { maxHeight: MAX_HEIGHT },
  rows: { gap: GAP },
  fade: { position: 'absolute', left: 0, right: 0 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
