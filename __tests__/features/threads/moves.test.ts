import { act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { Destination } from '@openmailbox/mail-core';

import { deleteThreadsForever, moveWithUndo, UNDO_HOLD_MS } from '@/features/threads/moves';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useUndoStore } from '@/stores/undoStore';

import { core, makeThread } from '../../helpers/fixtures';

const INBOX_THREAD = { mailboxId: 'mailbox-inbox', threadId: 'thread-1' };
const WORK_THREAD = { mailboxId: 'mailbox-work', threadId: 'thread-2' };

function relocatedTo(targetMailboxId: string | undefined) {
  core.moveThread.mockImplementation(async (_mailboxId, threadId) => ({
    emailIds: [`${threadId}-email`],
    targetMailboxId,
  }));
}

describe('moves with undo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useUndoStore.setState({ entry: null });
  });

  afterEach(() => jest.useRealTimers());

  it('holds the move while offering to undo it', async () => {
    relocatedTo('mailbox-archive');
    await moveWithUndo([INBOX_THREAD], new Destination.Archive(), 'Archived');

    const [mailboxId, threadId, destination, hold] = core.moveThread.mock.calls[0];
    expect([mailboxId, threadId, hold]).toEqual(['mailbox-inbox', 'thread-1', UNDO_HOLD_MS]);
    expect(Destination.Archive.instanceOf(destination)).toBe(true);
    expect(UNDO_HOLD_MS).toBe(5000);
    expect(useUndoStore.getState().entry?.label).toBe('Archived');
  });

  it('takes the threads off the lists before the core answers', () => {
    core.moveThread.mockReturnValue(new Promise(() => undefined));
    const kept = makeThread({ key: 'mailbox-inbox:thread-9', threadId: 'thread-9' });
    const moved = makeThread({ key: 'mailbox-inbox:thread-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' });
    queryClient.setQueryData(queryKeys.threads('unified', false), { pages: [{ threads: [moved, kept] }], pageParams: [undefined] });

    moveWithUndo([INBOX_THREAD], new Destination.Trash(), 'Moved to Trash');

    const pages = queryClient.getQueryData<{ pages: { threads: { threadId: string }[] }[] }>(queryKeys.threads('unified', false));
    expect(pages?.pages[0].threads.map((thread) => thread.threadId)).toEqual(['thread-9']);
  });

  it('puts every thread back where it came from', async () => {
    relocatedTo('mailbox-archive');
    await moveWithUndo([INBOX_THREAD, WORK_THREAD], new Destination.Archive(), 'Archived');

    await act(() => useUndoStore.getState().undo());

    const calls = core.moveEmails.mock.calls.map(([emailIds, from, destination, hold]) => [
      emailIds,
      from,
      Destination.Mailbox.instanceOf(destination) ? destination.inner.mailboxId : null,
      hold,
    ]);
    expect(calls).toEqual([
      [['thread-1-email'], 'mailbox-archive', 'mailbox-inbox', 0],
      [['thread-2-email'], 'mailbox-archive', 'mailbox-work', 0],
    ]);
    expect(useUndoStore.getState().entry).toBeNull();
  });

  it('still offers to undo the threads that moved when another one fails', async () => {
    core.moveThread.mockImplementation(async (_mailboxId, threadId) => {
      if (threadId === 'thread-2') throw new Error('gone');
      return { emailIds: [`${threadId}-email`], targetMailboxId: 'mailbox-archive' };
    });

    await expect(moveWithUndo([INBOX_THREAD, WORK_THREAD], new Destination.Archive(), 'Archived')).rejects.toThrow('gone');

    expect(useUndoStore.getState().entry?.moves.map((move) => move.sourceMailboxId)).toEqual(['mailbox-inbox']);
  });

  it('undoes only once when Undo is pressed twice', async () => {
    relocatedTo('mailbox-trash');
    await moveWithUndo([INBOX_THREAD], new Destination.Trash(), 'Moved to Trash');

    await act(() => Promise.all([useUndoStore.getState().undo(), useUndoStore.getState().undo()]));

    expect(core.moveEmails).toHaveBeenCalledTimes(1);
  });

  it('replaces the offer with the next move without undoing the first', async () => {
    relocatedTo('mailbox-archive');
    await moveWithUndo([INBOX_THREAD], new Destination.Archive(), 'Archived');
    await moveWithUndo([WORK_THREAD], new Destination.Trash(), 'Moved to Trash');

    expect(useUndoStore.getState().entry?.label).toBe('Moved to Trash');
    expect(core.moveEmails).not.toHaveBeenCalled();
  });

  it('withdraws the offer after five seconds and leaves the move alone', async () => {
    relocatedTo('mailbox-archive');
    await moveWithUndo([INBOX_THREAD], new Destination.Archive(), 'Archived');

    act(() => jest.advanceTimersByTime(4_999));
    expect(useUndoStore.getState().entry).not.toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(useUndoStore.getState().entry).toBeNull();
    expect(core.moveEmails).not.toHaveBeenCalled();
  });

  it('offers no undo when nothing could be moved back', async () => {
    relocatedTo(undefined);
    await moveWithUndo([INBOX_THREAD], new Destination.Trash(), 'Moved to Trash');
    expect(useUndoStore.getState().entry).toBeNull();
  });

  it('asks before deleting for good and never offers to undo it', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const deletion = deleteThreadsForever([INBOX_THREAD]);
    expect(core.moveThread).not.toHaveBeenCalled();

    const destructive = alert.mock.calls[0][2]!.find((button) => button.style === 'destructive')!;
    destructive.onPress!();
    await deletion;

    const [, , destination, hold] = core.moveThread.mock.calls[0];
    expect(Destination.Trash.instanceOf(destination)).toBe(true);
    expect(hold).toBe(0);
    expect(useUndoStore.getState().entry).toBeNull();
  });

  it('deletes nothing when the confirmation is cancelled', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const deletion = deleteThreadsForever([INBOX_THREAD]);
    alert.mock.calls[0][2]!.find((button) => button.style === 'cancel')!.onPress!();
    expect(await deletion).toBe(false);
    expect(core.moveThread).not.toHaveBeenCalled();
  });
});
