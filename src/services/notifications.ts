import * as Notifications from 'expo-notifications';
import { MailboxRole, type Mailbox, type NewMessage } from '@openmailbox/mail-core';
import type { Href } from 'expo-router';

import { UNIFIED_SCOPE } from '@/core/queryClient';
import { displayName } from '@/utils/addresses';
import i18n from '@/utils/i18n';

const SUMMARY_THRESHOLD = 3;

type NotificationData = { threadId?: string; mailboxId?: string };

export function inboxUnreadCount(mailboxes: Mailbox[]): number {
  return mailboxes
    .filter((mailbox) => mailbox.role === MailboxRole.Inbox)
    .reduce((total, mailbox) => total + mailbox.unreadCount, 0);
}

export function updateBadge(unread: number): Promise<boolean> {
  return Notifications.setBadgeCountAsync(unread);
}

let pendingRequest: Promise<boolean> | null = null;

export function requestNotificationPermission(): Promise<boolean> {
  pendingRequest ??= (async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().finally(() => {
    pendingRequest = null;
  });
  return pendingRequest;
}

export async function askNotificationPermissionIfNeverAsked(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'undetermined') await requestNotificationPermission();
}

export async function notifyNewMessages(messages: NewMessage[], { silencedAccountIds }: { silencedAccountIds: string[] }) {
  const shown = messages.filter(({ email }) => !email.isSeen && !silencedAccountIds.includes(email.accountId));
  if (shown.length > SUMMARY_THRESHOLD) {
    const senders = [...new Set(shown.map(({ email }) => displayName(email.from[0])))].join(', ');
    await Notifications.scheduleNotificationAsync({
      content: { title: i18n.t('notifications.newMessages', { count: shown.length }), body: senders, data: {} },
      trigger: null,
    });
    return;
  }
  for (const { mailboxId, email } of shown) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: displayName(email.from[0]) || i18n.t('threads.unknownSender'),
        subtitle: email.subject || i18n.t('reader.noSubject'),
        body: email.preview ?? '',
        data: { threadId: email.threadId, mailboxId },
      },
      trigger: null,
    });
  }
}

export function notificationRoute(data: NotificationData): Href {
  return data.threadId && data.mailboxId
    ? { pathname: '/thread/[threadId]', params: { threadId: data.threadId, mailboxId: data.mailboxId } }
    : `/mailbox/${UNIFIED_SCOPE}`;
}
