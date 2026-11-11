import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from 'expo-router';
import { Server } from 'lucide-react-native';

import { Typography } from '@/ui/components';

import type { BrandMark } from '../providers';

const monogramScale = (letters: number) => (letters > 4 ? 0.22 : letters > 2 ? 0.3 : 0.44);

export function ProviderMark({ brand, size = 32 }: { brand?: BrandMark; size?: number }) {
  const { colors } = useTheme();
  const tile = { width: size, height: size, borderRadius: size * 0.24 };

  if (!brand) {
    return (
      <View style={[styles.tile, tile, { backgroundColor: colors.surface }]}>
        <Server size={size * 0.56} color={colors.textSecondary} />
      </View>
    );
  }
  const glyph = size * (brand.scale ?? 0.58);
  const light = brand.background.toLowerCase() === '#ffffff';
  return (
    <View
      style={[
        styles.tile,
        tile,
        { backgroundColor: brand.background },
        light && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
      ]}
    >
      {brand.shapes ? (
        <Svg width={glyph} height={glyph} viewBox={brand.viewBox ?? '0 0 24 24'}>
          {brand.gradient ? (
            <Defs>
              <LinearGradient id="brand" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={brand.gradient[0]} />
                <Stop offset="1" stopColor={brand.gradient[1]} />
              </LinearGradient>
            </Defs>
          ) : null}
          {brand.shapes.map((shape) => (
            <Path key={shape.d} d={shape.d} fill={brand.gradient ? 'url(#brand)' : shape.fill} />
          ))}
        </Svg>
      ) : (
        <Typography
          weight="800"
          color={brand.monogramColor ?? '#ffffff'}
          style={{ fontSize: size * monogramScale(brand.monogram?.length ?? 0), letterSpacing: -0.3 }}
        >
          {brand.monogram}
        </Typography>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
