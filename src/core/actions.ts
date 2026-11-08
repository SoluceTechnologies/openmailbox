import { Destination, Keyword, type Draft, type ThreadSummary } from '@openmailbox/mail-core';

import { haptic } from '@/utils/haptics';

import { mailCore } from './mailCore';

export type ThreadReference = Pick<ThreadSummary, 'mailboxId' | 'threadId'>;

export function setThreadRead(thread: ThreadReference, read: boolean): Promise<void> {
  const keywords = [Keyword.Seen];
  return mailCore().setThreadKeywords(thread.mailboxId, thread.threadId, read ? keywords : [], read ? [] : keywords);
}

export function setThreadFlagged(thread: ThreadReference, flagged: boolean): Promise<void> {
  const keywords = [Keyword.Flagged];
  return mailCore().setThreadKeywords(thread.mailboxId, thread.threadId, flagged ? keywords : [], flagged ? [] : keywords);
}

export function archiveThread(thread: ThreadReference): Promise<void> {
  haptic();
  return mailCore().moveThread(thread.mailboxId, thread.threadId, new Destination.Archive());
}

export function trashThread(thread: ThreadReference): Promise<void> {
  haptic();
  return mailCore().moveThread(thread.mailboxId, thread.threadId, new Destination.Trash());
}

export function sendDraft(draft: Draft): Promise<void> {
  return mailCore().send(draft);
}
