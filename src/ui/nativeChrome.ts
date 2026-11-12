import { Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

export const NATIVE_CHROME = Platform.OS === 'ios';

export const LIQUID_GLASS = NATIVE_CHROME && isLiquidGlassAvailable();

export const translucentHeader = (backgroundColor: string) => ({
  headerTransparent: true,
  headerBlurEffect: LIQUID_GLASS ? undefined : ('systemChromeMaterial' as const),
  headerLargeStyle: LIQUID_GLASS ? undefined : { backgroundColor },
});
