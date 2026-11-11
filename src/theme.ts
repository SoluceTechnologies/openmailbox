import type { TextStyle } from 'react-native';
import { DefaultTheme } from 'expo-router';

export type ColorScheme = 'light' | 'dark';

export interface ThemeFontStyle {
  fontFamily: string;
  fontWeight: TextStyle['fontWeight'];
}

export interface ThemeFonts {
  regular: ThemeFontStyle;
  medium: ThemeFontStyle;
  bold: ThemeFontStyle;
  heavy: ThemeFontStyle;
}

export interface ThemeColors {
  background: string;
  groupedBackground: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderSubtle: string;
  primary: string;
  primaryText: string;
  danger: string;
  warning: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarInactive: string;
  headerBackground: string;
  chip: string;
  chipActive: string;
  card: string;
  notification: string;
  item: string;
  pressed: string;
  highlight: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface ThemeTypography {
  caption: number;
  body: number;
  title: number;
  heading: number;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  typography: ThemeTypography;
}


declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Theme {
      dark: boolean;
      colors: ThemeColors;
      fonts: ThemeFonts;
      spacing: ThemeSpacing;
      radius: ThemeRadius;
      typography: ThemeTypography;
    }
  }
}

const spacing: ThemeSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const radius: ThemeRadius = { sm: 8, md: 12, lg: 16, pill: 999 };
const typography: ThemeTypography = { caption: 13, body: 15, title: 17, heading: 22 };
const fonts: ThemeFonts = DefaultTheme.fonts;

const lightColors: ThemeColors = {
  background: '#ffffff',
  groupedBackground: '#f2f2f7',
  surface: '#f5f5f5',
  surfaceRaised: '#ffffff',
  text: '#1a1a1a',
  textSecondary: '#555555',
  textTertiary: '#888888',
  border: '#eeeeee',
  borderSubtle: '#f5f5f5',
  primary: '#109be6',
  primaryText: '#ffffff',
  danger: '#d32f2f',
  warning: '#f57c00',
  tabBar: '#ffffff',
  tabBarBorder: '#e0e0e0',
  tabBarInactive: '#8e8e93',
  headerBackground: '#ffffff',
  chip: '#f0f0f0',
  chipActive: '#109be6',
  card: '#ffffff',
  notification: '#d32f2f',
  item: '#ffffff',
  pressed: '#d1d1d6',
  highlight: '#fff0a8',
};

const darkColors: ThemeColors = {
  background: '#000000',
  groupedBackground: '#000000',
  surface: '#1e1e1e',
  surfaceRaised: '#2a2a2a',
  text: '#f1f1f1',
  textSecondary: '#aaaaaa',
  textTertiary: '#666666',
  border: '#333333',
  borderSubtle: '#242424',
  primary: '#29aef7',
  primaryText: '#ffffff',
  danger: '#ef5350',
  warning: '#ffa726',
  tabBar: '#1c1c1e',
  tabBarBorder: '#2c2c2e',
  tabBarInactive: '#636366',
  headerBackground: '#1c1c1e',
  chip: '#2c2c2e',
  chipActive: '#29aef7',
  card: '#1c1c1e',
  notification: '#ef5350',
  item: '#1c1c1e',
  pressed: '#3a3a3c',
  highlight: '#5c4d00',
};

export const ACCOUNT_COLORS = ['#109be6', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#8e8e93'];

export function accountColor(index: number): string {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
}

const AVATAR_COLORS = ['#5e8bde', '#3fae8c', '#d9822b', '#9b6bd3', '#d4577b', '#4aa3c9', '#8a9a3b', '#c46a4f'];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const lightTheme: Theme = { dark: false, colors: lightColors, fonts, spacing, radius, typography };
export const darkTheme: Theme = { dark: true, colors: darkColors, fonts, spacing, radius, typography };
