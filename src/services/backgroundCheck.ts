import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { boot } from '@/core/boot';
import { mailCore } from '@/core/mailCore';
import { useSettingsStore } from '@/stores/settingsStore';

import { inboxUnreadCount, notifyNewMessages, updateBadge } from './notifications';

const TASK = 'openmailbox-new-mail';
const CHECK_BUDGET_MS = 20_000;
const MINIMUM_INTERVAL_MINUTES = 15;

/** Syncs the inboxes, notifies what is new and updates the badge; never marks anything as read. */
export async function runBackgroundCheck(): Promise<'newData' | 'noData' | 'failed'> {
  try {
    await boot();
    const messages = await mailCore().checkNewMail(CHECK_BUDGET_MS);
    const { notificationsEnabled, silencedAccountIds } = useSettingsStore.getState();
    if (notificationsEnabled) await notifyNewMessages(messages, { silencedAccountIds });
    await updateBadge(inboxUnreadCount(await mailCore().listMailboxes(undefined)));
    return messages.length > 0 ? 'newData' : 'noData';
  } catch {
    return 'failed';
  }
}

TaskManager.defineTask(TASK, async () =>
  (await runBackgroundCheck()) === 'failed' ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success,
);

/** The system decides when the check runs: at best every 15 minutes, less often on iOS. */
export function registerBackgroundCheck(): Promise<void> {
  return BackgroundTask.registerTaskAsync(TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES });
}
