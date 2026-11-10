import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from 'expo-router';
import { Server } from 'lucide-react-native';

import { Typography } from '@/ui/components';

import type { BrandMark } from '../providers';

const monogramScale = (letters: number) => (letters > 4 ? 0.22 : letters > 2 ? 0.3 : 0.44);

export function ProviderMark({ brand, size = 32 }: { brand?: BrandMark; size?: number }) {
  const { colors } = useTheme();
  const tile = { width: size, height: size, borderRadius: size / 4 };

  if (!brand) {
    return (
      <View style={[styles.tile, tile, { backgroundColor: colors.surface }]}>
        <Server size={size * 0.56} color={colors.textSecondary} />
      </View>
    );
  }
  return (
    <View style={[styles.tile, tile, { backgroundColor: brand.color }]}>
      {brand.path ? (
        <Svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24">
          <Path d={brand.path} fill="#ffffff" />
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
