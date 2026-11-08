import { Destination, Keyword } from '@openmailbox/mail-core';

import { archiveThread, setThreadFlagged, setThreadRead, trashThread } from '@/core/actions';

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

  it('moves threads to the archive or the trash of their account', async () => {
    await archiveThread(thread);
    await trashThread(thread);
    const destinations = core.moveThread.mock.calls.map(([, , destination]) => destination);
    expect(Destination.Archive.instanceOf(destinations[0])).toBe(true);
    expect(Destination.Trash.instanceOf(destinations[1])).toBe(true);
  });
});
