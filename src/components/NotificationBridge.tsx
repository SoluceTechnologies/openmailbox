import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { useMailboxes } from '@/core/hooks';
import { registerBackgroundCheck } from '@/services/backgroundCheck';
import { inboxUnreadCount, notificationRoute, updateBadge } from '@/services/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

/** Keeps the badge current while the app is open, opens tapped notifications and schedules the background check. */
export function NotificationBridge() {
  const unread = inboxUnreadCount(useMailboxes());

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
