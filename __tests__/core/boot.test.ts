import { Category } from '@openmailbox/mail-core';

import { boot } from '@/core/boot';
import { queryClient, queryKeys, UNIFIED_SCOPE } from '@/core/queryClient';
import { useSettingsStore } from '@/stores/settingsStore';

import { core, makeAccount, makeMailbox, makeThread } from '../helpers/fixtures';

describe('boot', () => {
  it('reads All Inboxes, in the category last chosen, before the splash goes', async () => {
    const mailboxes = [makeMailbox()];
    const threads = [makeThread()];
    useSettingsStore.setState({ inboxFilter: 'transactions' });
    core.listAccounts.mockResolvedValue([makeAccount()]);
    core.listMailboxes.mockResolvedValue(mailboxes);
    core.listThreads.mockResolvedValue({ threads, nextCursor: undefined });

    await boot();

    expect(queryClient.getQueryData(queryKeys.mailboxes)).toEqual(mailboxes);
    expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), false, Category.Transactions, undefined, 50);
    expect(queryClient.getQueryData(queryKeys.threads(UNIFIED_SCOPE, false, Category.Transactions))).toMatchObject({
      pages: [{ threads }],
    });
  });
});
