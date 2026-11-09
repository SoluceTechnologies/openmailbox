import { Keyword } from '@openmailbox/mail-core';

import { setThreadFlagged, setThreadRead } from '@/core/actions';

import { core } from '../helpers/fixtures';

const thread = { mailboxId: 'mailbox-inbox', threadId: 'thread-1' };

describe('thread actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds or removes the seen keyword', async () => {
    await setThreadRead(thread, true);
    await setThreadRead(thread, false);
    expect(core.setThreadKeywords.mock.calls).toEqual([
      ['mailbox-inbox', 'thread-1', [Keyword.Seen], []],
      ['mailbox-inbox', 'thread-1', [], [Keyword.Seen]],
    ]);
  });

  it('adds or removes the flagged keyword', async () => {
    await setThreadFlagged(thread, true);
    expect(core.setThreadKeywords).toHaveBeenCalledWith('mailbox-inbox', 'thread-1', [Keyword.Flagged], []);
  });
});
