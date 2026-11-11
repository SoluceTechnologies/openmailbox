import { waitFor } from '@testing-library/react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { NotificationBridge } from '@/components/NotificationBridge';
import { queryClient, queryKeys } from '@/core/queryClient';

import { useSettingsStore } from '@/stores/settingsStore';

import { makeAccount, makeMailbox } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: jest.fn() } }));

describe('NotificationBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.setQueryData(queryKeys.mailboxes, [makeMailbox({ unreadCount: 2 }), makeMailbox({ id: 'b', accountId: 'account-2', unreadCount: 1 })]);
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
    useSettingsStore.setState({ notificationsEnabled: true });
  });

  it('asks once for notifications on an install that has accounts but was never asked', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined', granted: false });
    renderWithProviders(<NotificationBridge />);
    await waitFor(() => expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1));
  });

  it('does not ask again once the person has answered', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied', granted: false });
    renderWithProviders(<NotificationBridge />);
    await waitFor(() => expect(Notifications.getPermissionsAsync).toHaveBeenCalled());
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('keeps the badge at the unread mail of the inboxes and schedules the background check', async () => {
    renderWithProviders(<NotificationBridge />);
    await waitFor(() => expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(3));
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith('openmailbox-new-mail', { minimumInterval: 15 });
  });

  it('opens the thread of a tapped notification', () => {
    renderWithProviders(<NotificationBridge />);
    const onResponse = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0];
    onResponse({ notification: { request: { content: { data: { threadId: 'thread-1', mailboxId: 'mailbox-inbox' } } } } });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/thread/[threadId]',
      params: { threadId: 'thread-1', mailboxId: 'mailbox-inbox' },
    });
  });
});
