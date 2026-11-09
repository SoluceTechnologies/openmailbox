import type { ExpoConfig } from 'expo/config';

import { version } from './package.json';

const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const config: ExpoConfig = {
  name: 'OpenMailbox',
  slug: 'openmailbox',
  scheme: 'openmailbox',
  version,
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],
  icon: './assets/icon.png',
  assetBundlePatterns: ['**/*'],

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.soluce.openmailbox',
    infoPlist: {
      CFBundleDisplayName: 'OpenMailbox',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: 'com.soluce.openmailbox',
    versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#007aff',
    },
    softwareKeyboardLayoutMode: 'resize',
    allowBackup: false,
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    [
      'expo-contacts',
      {
        contactsPermission: 'OpenMailbox suggests addresses from your contacts while you write. They stay on this device.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'OpenMailbox attaches the photos and videos you choose to your messages.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#007aff',
      },
    ],
  ],

  experiments: {
    typedRoutes: false,
  },
};

export default config;
