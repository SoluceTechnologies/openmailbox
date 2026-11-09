import * as Notifications from 'expo-notifications';

import { runBackgroundCheck } from '@/services/backgroundCheck';
import { useSettingsStore } from '@/stores/settingsStore';

import { core, makeEmail, makeMailbox } from '../helpers/fixtures';

describe('background check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ notificationsEnabled: true, silencedAccountIds: [] });
    core.listAccounts.mockResolvedValue([]);
    core.listMailboxes.mockResolvedValue([makeMailbox({ unreadCount: 5 })]);
  });

  it('notifies new mail and updates the badge', async () => {
    core.checkNewMail.mockResolvedValue([{ mailboxId: 'mailbox-inbox', email: makeEmail() }]);
    expect(await runBackgroundCheck()).toBe('newData');
    expect(core.checkNewMail).toHaveBeenCalledWith(20_000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(5);
  });

  it('keeps the badge current without posting anything when notifications are off', async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    core.checkNewMail.mockResolvedValue([{ mailboxId: 'mailbox-inbox', email: makeEmail() }]);
    await runBackgroundCheck();
    expect(core.checkNewMail).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(5);
  });

  it('reports a failed check instead of throwing', async () => {
    core.checkNewMail.mockRejectedValue(new Error('offline'));
    expect(await runBackgroundCheck()).toBe('failed');
  });

  it('reports when there was nothing new', async () => {
    core.checkNewMail.mockResolvedValue([]);
    expect(await runBackgroundCheck()).toBe('noData');
  });
});
