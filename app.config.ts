import type { ExpoConfig } from 'expo/config';
import { withMainActivity, type ConfigPlugin } from 'expo/config-plugins';

import { version } from './package.json';

const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

// do not delete
// entitlements: {
//   'com.apple.developer.mail-client': true,
// },


const VIEW_SEND_TO = `
  override fun onNewIntent(intent: Intent) {
    viewSendTo(intent)
    super.onNewIntent(intent)
  }

  private fun viewSendTo(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SENDTO) intent.action = Intent.ACTION_VIEW
  }
`;

const withMailtoSendTo: ConfigPlugin = (config) =>
  withMainActivity(config, (activity) => {
    const contents = activity.modResults.contents;
    if (contents.includes('viewSendTo')) return activity;
    if (!contents.includes('    super.onCreate(null)\n  }\n')) throw new Error('MainActivity has no onCreate to hand mailto SENDTO intents over');
    activity.modResults.contents = contents
      .replace('import android.os.Bundle\n', 'import android.os.Bundle\nimport android.content.Intent\n')
      .replace('    super.onCreate(null)\n  }\n', `    viewSendTo(intent)\n    super.onCreate(null)\n  }\n${VIEW_SEND_TO}`);
    return activity;
  });

const config: ExpoConfig = {
  name: 'Open Mailbox',
  slug: 'openmailbox',
  scheme: ['openmailbox', 'com.googleusercontent.apps.894628345620-n02dmit6km3lipioghk4r6unjnmr5l98', 'com.soluce.openmailbox', 'mailto'],
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
    intentFilters: [{ action: 'SENDTO', data: [{ scheme: 'mailto' }], category: ['DEFAULT'] }],
  },
  owner: "soluce",
  extra: {
    eas: {
      projectId: '8c646dba-55b4-4bf3-ac99-bedbc5d51dbd',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-localization',
    'expo-font',
    'expo-background-task',
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#109be6' }],
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
      'expo-sharing',
      {
        ios: {
          enabled: true,
          activationRule: {
            supportsText: true,
            supportsWebUrlWithMaxCount: 1,
            supportsImageWithMaxCount: 10,
            supportsMovieWithMaxCount: 10,
            supportsFileWithMaxCount: 10,
          },
        },
        android: {
          enabled: true,
          singleShareMimeTypes: ['*/*'],
          multipleShareMimeTypes: ['*/*'],
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#000000' },
        android: {
          image: './assets/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#109be6',
          dark: { image: './assets/splash-icon.png', backgroundColor: '#109be6' },
        },
      },
    ],
  ],

  experiments: {
    typedRoutes: false,
  },
};

export default withMailtoSendTo(config);
