require('react-native-gesture-handler/jestSetup');
require('@shopify/flash-list/jestSetup');

const { notifyManager } = require('@tanstack/react-query');
const { act } = require('@testing-library/react-native');

notifyManager.setNotifyFunction((notify) => act(notify));

jest.mock('@/core/mailCore', () => {
  const core = {
    addAccount: jest.fn(),
    body: jest.fn(async () => ({ text: '', hasRemoteContent: false, attachments: [] })),
    discover: jest.fn(),
    listAccounts: jest.fn(async () => []),
    listMailboxes: jest.fn(async () => []),
    listThreads: jest.fn(async () => ({ threads: [] })),
    loadOlder: jest.fn(async () => undefined),
    moveThread: jest.fn(async () => ({ emailIds: [], targetMailboxId: undefined })),
    moveEmails: jest.fn(async () => ({ emailIds: [], targetMailboxId: undefined })),
    onBackground: jest.fn(),
    onForeground: jest.fn(),
    openMailbox: jest.fn(async () => undefined),
    removeAccount: jest.fn(async () => undefined),
    renameAccount: jest.fn(async () => undefined),
    saveAttachment: jest.fn(),
    search: jest.fn(async () => []),
    suggestAddresses: jest.fn(async () => []),
    send: jest.fn(async () => undefined),
    setKeywords: jest.fn(async () => undefined),
    setSenderCategory: jest.fn(async () => undefined),
    setThreadKeywords: jest.fn(async () => undefined),
    subscribe: jest.fn(),
    syncNow: jest.fn(),
    checkNewMail: jest.fn(async () => []),
    unsubscribe: jest.fn(async () => ({ tag: "Done" })),
    threadEmails: jest.fn(async () => []),
    unlockAccount: jest.fn(),
    updatePassword: jest.fn(async () => undefined),
  };
  return {
    mailCore: () => core,
    attachmentsDirectory: () => '/cache/attachments',
  };
});

jest.mock('expo-secure-store', () => {
  const values = new Map();
  return {
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    setItemAsync: jest.fn(async (key, value) => void values.set(key, value)),
    getItemAsync: jest.fn(async (key) => values.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key) => void values.delete(key)),
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'notification'),
  setBadgeCountAsync: jest.fn(async () => true),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-contacts/legacy', () => ({
  Fields: { Emails: 'emails', Name: 'name' },
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getContactsAsync: jest.fn(async () => ({ data: [] })),
  presentContactPickerAsync: jest.fn(async () => null),
  presentFormAsync: jest.fn(async () => undefined),
  ContactTypes: { Person: 'person', Company: 'company' },
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

jest.mock('react-native-reanimated', () => {
  const { View, ScrollView, FlatList } = require('react-native');
  return {
    __esModule: true,
    default: { View, ScrollView, FlatList, createAnimatedComponent: (component) => component },
    View,
    ScrollView,
    createAnimatedComponent: (component) => component,
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: () => ({}),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
    useAnimatedScrollHandler: (handler) => handler,
    useAnimatedReaction: () => undefined,
    useEvent: () => null,
    useFrameCallback: () => ({ setActive: () => undefined, isActive: false, callbackId: -1 }),
    scrollTo: () => undefined,
    useDerivedValue: (compute) => ({ value: compute() }),
    interpolate: (value) => value,
    withTiming: (value, _config, callback) => {
      callback?.(true);
      return value;
    },
    withSpring: (value) => value,
    withRepeat: (value) => value,
    withSequence: (...values) => values.at(-1),
    withDelay: (_delay, value) => value,
    cancelAnimation: () => undefined,
    Easing: { out: (easing) => easing, quad: (progress) => progress },
    FadeIn: {},
    FadeOut: {},
    LinearTransition: {},
    runOnJS: (fn) => (...args) => fn(...args),
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(function WebView(props, _reference) {
      return React.createElement(View, { testID: 'web-view', ...props });
    }),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(function Swipeable({ children, renderLeftActions, renderRightActions }, _reference) {
      return React.createElement(View, null, renderLeftActions?.(), children, renderRightActions?.());
    }),
  };
});

// iOS chrome (native headers, toolbars, menus) needs a navigator; the tests cover the shared UI.
jest.mock('@/ui/nativeChrome', () => ({ NATIVE_CHROME: false }));
jest.mock('@expo/ui/swift-ui', () => ({}));

afterAll(() => {
  require('@/core/queryClient').queryClient.clear();
});
