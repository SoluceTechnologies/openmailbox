import { Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

export const NATIVE_CHROME = Platform.OS === 'ios';

export const LIQUID_GLASS = NATIVE_CHROME && isLiquidGlassAvailable();

export const TRANSLUCENT_HEADER = {
  headerTransparent: true,
  headerBlurEffect: LIQUID_GLASS ? undefined : 'systemChromeMaterial',
} as const;
