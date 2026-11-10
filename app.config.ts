import type { ExpoConfig } from 'expo/config';

import { version } from './package.json';

const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const config: ExpoConfig = {
  name: 'Open Mailbox',
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
    icon: './assets/icon-ios.icon',
    infoPlist: {
      CFBundleDisplayName: 'Open Mailbox',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: 'com.soluce.openmailbox',
    versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon.png',
      backgroundColor: '#109be6',
    },
    softwareKeyboardLayoutMode: 'resize',
    allowBackup: false,
    blockedPermissions: ['android.permission.WRITE_CONTACTS'],
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    'expo-background-task',
    ['expo-notifications', { color: '#109be6' }],
    [
      'expo-contacts',
      {
        contactsPermission: 'Open Mailbox suggests addresses from your contacts while you write. They stay on this device.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Open Mailbox attaches the photos and videos you choose to your messages.',
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
        backgroundColor: '#0082c9',
      },
    ],
  ],

  experiments: {
    typedRoutes: false,
  },
};

export default config;
