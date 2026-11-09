import * as Notifications from 'expo-notifications';
import { MailboxRole } from '@openmailbox/mail-core';

import { inboxUnreadCount, notificationRoute, notifyNewMessages, updateBadge } from '@/services/notifications';
import i18n from '@/utils/i18n';

import { makeEmail, makeMailbox } from '../helpers/fixtures';

const message = (id: string, overrides = {}) => ({
  mailboxId: 'mailbox-inbox',
  email: makeEmail({ id, threadId: `thread-${id}`, subject: `Sujet ${id}`, preview: `Aperçu ${id}`, ...overrides }),
});

describe('notifications', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => jest.clearAllMocks());

  it('posts one notification per new unread message of the accounts that want them', async () => {
    await notifyNewMessages(
      [message('1'), message('2', { isSeen: true }), message('3', { accountId: 'account-2' })],
      { silencedAccountIds: ['account-2'] },
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Claire Dubois',
        subtitle: 'Sujet 1',
        body: 'Aperçu 1',
        data: { threadId: 'thread-1', mailboxId: 'mailbox-inbox' },
      },
      trigger: null,
    });
  });

  it('sums up when more than three messages arrive', async () => {
    await notifyNewMessages(['1', '2', '3', '4'].map((id) => message(id)), { silencedAccountIds: [] });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const { content } = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(content.title).toBe(i18n.t('notifications.newMessages', { count: 4 }));
    expect(content.data).toEqual({});
  });

  it('opens the thread of a message, or the inboxes for a summary', () => {
    expect(notificationRoute({ threadId: 'thread-1', mailboxId: 'mailbox-inbox' })).toEqual({
      pathname: '/thread/[threadId]',
      params: { threadId: 'thread-1', mailboxId: 'mailbox-inbox' },
    });
    expect(notificationRoute({})).toBe('/mailbox/unified');
  });

  it('badges the icon with the unread mail of every inbox', async () => {
    const mailboxes = [
      makeMailbox({ unreadCount: 3 }),
      makeMailbox({ id: 'other-inbox', accountId: 'account-2', unreadCount: 4 }),
      makeMailbox({ id: 'junk', role: MailboxRole.Junk, unreadCount: 9 }),
    ];
    expect(inboxUnreadCount(mailboxes)).toBe(7);
    await updateBadge(7);
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(7);
  });
});
