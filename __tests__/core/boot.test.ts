import { Category } from '@openmailbox/mail-core';

import { boot } from '@/core/boot';
import { EMPTY_THREAD_FILTER } from '@/core/hooks';
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
    expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), EMPTY_THREAD_FILTER, Category.Transactions, undefined, 50);
    expect(queryClient.getQueryData(queryKeys.threads(UNIFIED_SCOPE, EMPTY_THREAD_FILTER, Category.Transactions))).toMatchObject({
      pages: [{ threads }],
    });
  });

  it('hands the core the outgoing password of an account that keeps one', async () => {
    jest.resetModules();
    const fresh = {
      ...(require('@/core/boot') as typeof import('@/core/boot')),
      ...(require('@/core/secrets') as typeof import('@/core/secrets')),
      ...(require('../helpers/fixtures') as typeof import('../helpers/fixtures')),
    };
    fresh.core.listAccounts.mockResolvedValue([fresh.makeAccount(), fresh.makeAccount({ id: 'account-2', smtpUsername: 'bob-smtp' })]);
    await fresh.saveSecret('account-1', 'alice-secret');
    await fresh.saveSecret(fresh.smtpSecretId('account-1'), 'stale-smtp-secret');
    await fresh.saveSecret('account-2', 'imap-secret');
    await fresh.saveSecret(fresh.smtpSecretId('account-2'), 'smtp-secret');

    await fresh.boot();

    expect(fresh.core.unlockSmtp).toHaveBeenCalledTimes(1);
    expect(fresh.core.unlockSmtp).toHaveBeenCalledWith('account-2', 'smtp-secret');
    expect(fresh.core.unlockAccount).toHaveBeenCalledWith('account-2', 'imap-secret');
  });
});
