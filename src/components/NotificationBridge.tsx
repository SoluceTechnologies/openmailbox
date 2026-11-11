import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { useAccounts, useMailboxes } from '@/core/hooks';
import { registerBackgroundCheck } from '@/services/backgroundCheck';
import { askNotificationPermissionIfNeverAsked, inboxUnreadCount, notificationRoute, updateBadge } from '@/services/notifications';
import { useSettingsStore } from '@/stores/settingsStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export function NotificationBridge() {
  const unread = inboxUnreadCount(useMailboxes());
  const hasAccount = useAccounts().length > 0;
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);

  useEffect(() => {
    if (hasAccount && notificationsEnabled) askNotificationPermissionIfNeverAsked().catch(() => undefined);
  }, [hasAccount, notificationsEnabled]);

  useEffect(() => {
    updateBadge(unread).catch(() => undefined);
  }, [unread]);

  useEffect(() => {
    registerBackgroundCheck().catch(() => undefined);
    const open = (response: Notifications.NotificationResponse | null) => {
      if (response) router.push(notificationRoute(response.notification.request.content.data ?? {}));
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  return null;
}
